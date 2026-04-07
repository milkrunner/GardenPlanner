// Gartenplaner App - REST API mit LocalStorage-Fallback
// Orchestrator: Defines class, constructor, init, and Weather integration.
// Methods are added by module files via prototype extension:
//   task-state.js, task-filters.js, task-renderer.js, task-events.js, task-export.js
class GartenPlaner {
	constructor() {
		this.tasks = [];
		this.archivedTasks = [];
		this.showArchive = false;
		this.currentFilter = {
			employee: "",
			location: "",
			status: "",
		};
		this.searchQuery = "";
		this.currentView = "list";
		this.draggedTaskId = null;
		this.selectedTasks = new Set();
		this.bulkMode = false;
		this.tempSubtasks = [];
		this.tempPhotos = [];
		this.useAPI = typeof window.TaskAPI !== "undefined";
		this.undoStack = [];
		this.undoTimeout = null;
		this.init();
	}

	async init() {
		this.tasks = await this.loadTasks();
		this.archivedTasks = await this.loadArchivedTasks();

		if (window.logger) {
			window.logger.info("GartenPlaner initialisiert", "app", {
				tasksCount: this.tasks.length,
				archivedCount: this.archivedTasks.length,
				mode: this.useAPI ? "API" : "localStorage",
			});
		}

		this.checkRecurringTasks();
		this.setupEventListeners();
		this.setupCreateSubtaskListeners();
		this.updateEmployeeFilter();
		this.updateLocationFilter();
		this.renderTasks();
		this.updateStatistics();
		this.initWeather();

		this._ready = true;
		if (this._onReady) this._onReady();
	}

	whenReady() {
		if (this._ready) return Promise.resolve();
		return new Promise((resolve) => { this._onReady = resolve; });
	}

	// ===== WEATHER API INTEGRATION =====

	initWeather() {
		const weatherSection = document.querySelector(".weather-section");
		if (!weatherSection) return;

		const changeLocationBtn = document.getElementById("changeLocationBtn");
		if (changeLocationBtn) {
			changeLocationBtn.addEventListener("click", () => this.promptLocation());
		}

		this.loadWeather();
	}

	async loadWeather() {
		try {
			const location = this.getStoredLocation();

			if (!location) {
				await this.promptLocation();
				return;
			}

			const cached = this.getCachedWeather();
			if (cached) {
				this.renderWeather(cached);
				return;
			}

			await this.fetchWeather(location);
		} catch (error) {
			console.error("Fehler beim Laden des Wetters:", error);
			if (window.errorBoundary) {
				window.errorBoundary.handleError({
					type: 'runtime',
					message: 'Wetterdaten konnten nicht geladen werden: ' + error.message,
					error: error,
					function: 'loadWeather',
					context: {},
					timestamp: new Date().toISOString()
				});
			}
			this.showWeatherError("Fehler beim Laden der Wetterdaten");
		}
	}

	getStoredLocation() {
		const stored = localStorage.getItem("weather_location");
		if (!stored) return null;
		try {
			return JSON.parse(atob(stored));
		} catch {
			localStorage.removeItem("weather_location");
			return null;
		}
	}

	storeLocation(location) {
		localStorage.setItem("weather_location", btoa(JSON.stringify(location)));
	}

	getCachedWeather() {
		const cached = localStorage.getItem("weather_cache");
		if (!cached) return null;

		try {
			const data = JSON.parse(atob(cached));
			const age = Date.now() - data.timestamp;
			const maxAge = 60 * 60 * 1000;

			if (age < maxAge) {
				return data.weather;
			}
		} catch {
			localStorage.removeItem("weather_cache");
		}

		return null;
	}

	cacheWeather(weather) {
		const data = {
			timestamp: Date.now(),
			weather: weather,
		};
		localStorage.setItem("weather_cache", btoa(JSON.stringify(data)));
	}

	async promptLocation() {
		const locationName = prompt(
			'Bitte geben Sie Ihren Standort ein (z.B. "Berlin" oder "München"):',
			this.getStoredLocation()?.name || "Berlin",
		);

		if (!locationName || !locationName.trim()) return;

		const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName.trim())}&count=1&language=de&format=json`;

		try {
			const response = await fetch(geocodeUrl);
			const data = await response.json();

			if (!data.results || data.results.length === 0) {
				alert("Standort nicht gefunden. Bitte versuchen Sie es erneut.");
				return;
			}

			const result = data.results[0];
			const location = {
				name: result.name,
				country: result.country,
				lat: result.latitude,
				lon: result.longitude,
			};

			this.storeLocation(location);
			await this.fetchWeather(location);
		} catch (error) {
			console.error("Fehler beim Geocoding:", error);
			if (window.errorBoundary) {
				window.errorBoundary.handleError({
					type: 'runtime',
					message: 'Geocoding fehlgeschlagen: ' + error.message,
					error: error,
					function: 'promptLocation',
					context: {},
					timestamp: new Date().toISOString()
				});
			}
			alert("Fehler beim Suchen des Standorts.");
		}
	}

	async fetchWeather(location) {
		const weatherForecast = document.getElementById("weatherForecast");
		if (weatherForecast) {
			weatherForecast.innerHTML =
				'<div class="weather-loading">Lade Wetterdaten...</div>';
		}

		const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=Europe/Berlin&forecast_days=7`;

		try {
			const response = await fetch(url);
			const data = await response.json();

			const weather = {
				location: location,
				daily: data.daily,
			};

			this.cacheWeather(weather);
			this.renderWeather(weather);
		} catch (error) {
			console.error("Fehler beim Abrufen der Wetterdaten:", error);
			if (window.errorBoundary) {
				window.errorBoundary.handleError({
					type: 'runtime',
					message: 'Wetterdaten-Abruf fehlgeschlagen: ' + error.message,
					error: error,
					function: 'fetchWeather',
					context: { location: location.name },
					timestamp: new Date().toISOString()
				});
			}
			this.showWeatherError("Fehler beim Laden der Wetterdaten");
		}
	}

	renderWeather(weather) {
		const weatherLocationName = document.getElementById("weatherLocationName");
		const weatherForecast = document.getElementById("weatherForecast");

		if (!weatherForecast) return;

		if (weatherLocationName) {
			weatherLocationName.textContent = `${weather.location.name}, ${weather.location.country}`;
		}

		const days = weather.daily.time.slice(0, 7);

		const cardsHtml = days
			.map((date, index) => {
				const weatherCode = weather.daily.weather_code[index];
				const tempMax = Math.round(weather.daily.temperature_2m_max[index]);
				const tempMin = Math.round(weather.daily.temperature_2m_min[index]);

				const dayName = this.getDayName(date, index);
				const weatherInfo = this.getWeatherInfo(weatherCode);
				const todayClass = index === 0 ? "today" : "";

				const precipitation = weather.daily.precipitation_sum[index] || 0;
				const gardenTip = this.getGardenTip(weatherCode, tempMax, precipitation);

				return `
                <div class="weather-day-card ${todayClass}">
                    <div class="weather-icon-wrapper">
                        <div class="weather-icon">${weatherInfo.icon}</div>
                    </div>
                    <div class="weather-content">
                        <div class="weather-day-name">${dayName}</div>
                        <div class="weather-day-date">${new Date(date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</div>
                        <div class="weather-temp">${tempMax}°</div>
                        <div class="weather-temp-range">${tempMin}° - ${tempMax}°</div>
                        <div class="weather-description">${weatherInfo.description}</div>
                        ${gardenTip}
                    </div>
                </div>
            `;
			})
			.join("");

		const reminders = this.getWeatherReminders(weather);
		weatherForecast.innerHTML = cardsHtml + reminders;
	}

	getDayName(dateString, index) {
		if (index === 0) return "Heute";
		if (index === 1) return "Morgen";

		const date = new Date(dateString);
		const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
		return days[date.getDay()];
	}

	getWeatherInfo(code) {
		const weatherCodes = {
			0: { icon: "☀️", description: "Klar" },
			1: { icon: "🌤️", description: "Meist klar" },
			2: { icon: "⛅", description: "Teilweise bewölkt" },
			3: { icon: "☁️", description: "Bewölkt" },
			45: { icon: "🌫️", description: "Neblig" },
			48: { icon: "🌫️", description: "Neblig" },
			51: { icon: "🌦️", description: "Leichter Nieselregen" },
			53: { icon: "🌦️", description: "Nieselregen" },
			55: { icon: "🌧️", description: "Starker Nieselregen" },
			61: { icon: "🌧️", description: "Leichter Regen" },
			63: { icon: "🌧️", description: "Regen" },
			65: { icon: "🌧️", description: "Starker Regen" },
			71: { icon: "🌨️", description: "Leichter Schneefall" },
			73: { icon: "🌨️", description: "Schneefall" },
			75: { icon: "🌨️", description: "Starker Schneefall" },
			77: { icon: "🌨️", description: "Schnee\u00ADkörner" },
			80: { icon: "🌦️", description: "Leichte Schauer" },
			81: { icon: "🌧️", description: "Schauer" },
			82: { icon: "🌧️", description: "Starke Schauer" },
			85: { icon: "🌨️", description: "Schnee\u00ADschauer" },
			86: { icon: "🌨️", description: "Starke Schnee\u00ADschauer" },
			95: { icon: "⛈️", description: "Gewitter" },
			96: { icon: "⛈️", description: "Gewitter mit Hagel" },
			99: { icon: "⛈️", description: "Starkes Gewitter" },
		};

		return weatherCodes[code] || { icon: "🌡️", description: "Unbekannt" };
	}

	getGardenTip(weatherCode, tempMax, precipitation) {
		let tip = "";

		if (
			(weatherCode >= 61 && weatherCode <= 65) ||
			(weatherCode >= 80 && weatherCode <= 82)
		) {
			tip = "💧 Kein Gießen nötig";
		} else if (tempMax > 25 && precipitation < 1) {
			tip = "🚿 Gießen empfohlen";
		} else if (weatherCode >= 71 && weatherCode <= 86) {
			tip = "❄️ Frostschutz prüfen";
		} else if (weatherCode >= 95) {
			tip = "⚠️ Pflanzen schützen";
		} else if (tempMax > 15 && tempMax < 25 && precipitation < 5) {
			tip = "🌱 Ideal zum Pflanzen";
		}

		return tip ? `<div class="garden-tip">${tip}</div>` : "";
	}

	getWeatherReminders(weather) {
		const reminders = [];
		const todayCode = weather.daily.weather_code[0];
		const todayTemp = Math.round(weather.daily.temperature_2m_max[0]);
		const todayPrecip = weather.daily.precipitation_sum[0] || 0;
		const tomorrowCode = weather.daily.weather_code[1];
		const tomorrowPrecip = weather.daily.precipitation_sum[1] || 0;

		// Rainy today — skip watering
		if ((todayCode >= 51 && todayCode <= 65) || (todayCode >= 80 && todayCode <= 82)) {
			reminders.push({ icon: "💧", text: "Heute regnet es — Bewässerung kann ausgesetzt werden." });
		} else if (todayTemp > 25 && todayPrecip < 1) {
			reminders.push({ icon: "🚿", text: "Heiß und trocken heute — Pflanzen gut gießen, am besten morgens oder abends." });
		}

		// Frost warning
		const minTemps = weather.daily.temperature_2m_min.slice(0, 3);
		if (minTemps.some(t => t <= 2)) {
			reminders.push({ icon: "❄️", text: "Frost möglich in den nächsten Tagen — empfindliche Pflanzen schützen!" });
		}

		// Storm warning
		if (todayCode >= 95 || tomorrowCode >= 95) {
			reminders.push({ icon: "⛈️", text: "Gewitter erwartet — Gartenmöbel und lose Gegenstände sichern." });
		}

		// Good planting conditions
		if (todayTemp > 15 && todayTemp < 25 && todayPrecip < 5 && todayCode <= 3) {
			reminders.push({ icon: "🌱", text: "Ideale Bedingungen heute zum Pflanzen und Arbeiten im Garten." });
		}

		// Rain tomorrow — plan outdoor work today
		if ((tomorrowCode >= 51 && tomorrowCode <= 65) || (tomorrowCode >= 80 && tomorrowCode <= 82)) {
			if (todayCode <= 3) {
				reminders.push({ icon: "📋", text: "Morgen wird es nass — Außenarbeiten besser heute erledigen." });
			}
		}

		// Wind warning
		const windMax = weather.daily.wind_speed_10m_max?.[0] || 0;
		if (windMax > 50) {
			reminders.push({ icon: "💨", text: `Starker Wind heute (${Math.round(windMax)} km/h) — Gewächshäuser prüfen.` });
		}

		if (reminders.length === 0) return "";

		return `<div class="weather-reminders">
			<h3>🌿 Garten-Empfehlungen</h3>
			<ul class="reminder-list">
				${reminders.map(r => `<li><span class="reminder-icon">${r.icon}</span> ${r.text}</li>`).join("")}
			</ul>
		</div>`;
	}

	showWeatherError(message) {
		const weatherForecast = document.getElementById("weatherForecast");
		if (weatherForecast) {
			weatherForecast.innerHTML = `
                <div class="weather-error">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                        <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <p>${message}</p>
                    <button class="btn btn-secondary" onclick="window.gartenPlaner.promptLocation()">Standort eingeben</button>
                </div>
            `;
		}
	}
}

// Dark Mode Toggle
class ThemeManager {
	constructor() {
		this.theme = localStorage.getItem("theme") || "light";
		this.init();
	}

	init() {
		this.applyTheme(this.theme);

		const themeToggle = document.getElementById("themeToggle");
		if (themeToggle) {
			themeToggle.addEventListener("click", () => this.toggleTheme());
		}
	}

	applyTheme(theme) {
		document.documentElement.setAttribute("data-theme", theme);
		this.updateIcon(theme);
		localStorage.setItem("theme", theme);
		this.theme = theme;
	}

	toggleTheme() {
		const newTheme = this.theme === "light" ? "dark" : "light";
		this.applyTheme(newTheme);

		const themeToggle = document.getElementById("themeToggle");
		if (themeToggle) {
			themeToggle.setAttribute(
				"aria-pressed",
				newTheme === "dark" ? "true" : "false",
			);
			themeToggle.setAttribute(
				"aria-label",
				newTheme === "dark" ? "Light Mode aktivieren" : "Dark Mode aktivieren",
			);
		}
	}

	updateIcon(theme) {
		const icon = document.getElementById("themeIcon");
		if (icon) {
			if (theme === "light") {
				icon.innerHTML =
					'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
			} else {
				icon.innerHTML =
					'<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
			}
		}
	}
}

// App initialisieren
document.addEventListener("DOMContentLoaded", () => {
	window.themeManager = new ThemeManager();
	window.GP.themeManager = window.themeManager;

	window.gartenPlaner = new GartenPlaner();
	window.GP.gartenPlaner = window.gartenPlaner;
	window.gartenPlaner.setupBulkActionListeners();

	const container = document.querySelector(".container");
	if (container) {
		const printDate = new Date().toLocaleDateString("de-DE", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
		container.setAttribute("data-print-date", printDate);
	}

	window.addEventListener("beforeprint", () => {
		document.documentElement.setAttribute("data-print-mode", "true");
	});

	window.addEventListener("afterprint", () => {
		document.documentElement.removeAttribute("data-print-mode");
	});

	document.addEventListener("keydown", (e) => {
		const activeElement = document.activeElement;

		if (e.key === "Escape") {
			const modal = document.getElementById("editModal");
			if (modal && modal.style.display === "flex") {
				modal.style.display = "none";
			}
		}

		if (
			(e.key === "Enter" || e.key === " ") &&
			activeElement.classList.contains("task-btn")
		) {
			e.preventDefault();
			activeElement.click();
		}
	});

	const announcer = document.createElement("div");
	announcer.setAttribute("role", "status");
	announcer.setAttribute("aria-live", "polite");
	announcer.setAttribute("aria-atomic", "true");
	announcer.className = "sr-only";
	document.body.appendChild(announcer);
	window.announcer = announcer;
	window.GP.announcer = announcer;

	console.log("🌱 Gartenplaner erfolgreich gestartet!");
	console.log(
		"💾 Alle Änderungen werden automatisch im Browser gespeichert (LocalStorage)",
	);
	console.log("🖱️ Drag & Drop aktiviert - Ziehe Aufgaben zum Sortieren!");
	console.log(
		"✓ Bulk-Aktionen aktiviert - Mehrere Aufgaben gleichzeitig bearbeiten!",
	);
	console.log("🌙 Dark Mode verfügbar - Klick auf den Button unten rechts!");
	console.log(
		"🖨️ Print-Stylesheet aktiviert - Optimierte Druckansicht verfügbar!",
	);
	console.log(
		"♿ Accessibility verbessert - ARIA-Labels und Keyboard-Navigation!",
	);
});
