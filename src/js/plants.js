// Plant Library Module
(function () {
	const API_BASE = "/api";
	let allPlants = [];
	let currentCategory = "";
	let lastOpener = null;

	// Detail-Dialog schließen und Fokus zum auslösenden Element zurückgeben
	function closePlantDetail() {
		const modal = document.getElementById("plantModal");
		if (!modal || modal.style.display === "none") return;
		modal.style.display = "none";
		if (lastOpener && lastOpener.focus) lastOpener.focus();
		lastOpener = null;
	}

	async function init() {
		await loadCategories();
		await loadPlants();
		setupEventListeners();
	}

	async function loadCategories() {
		try {
			const res = await fetch(`${API_BASE}/plant-categories`);
			const categories = await res.json();
			const container = document.getElementById("categoryFilters");
			if (!container) return;

			// Kategorienamen kommen vom Server: nur als Text rendern
			const buttons = ["", ...categories].map((category) => {
				const btn = document.createElement("button");
				btn.type = "button";
				btn.className = "category-btn" + (category === "" ? " active" : "");
				btn.dataset.category = category;
				btn.setAttribute("aria-pressed", category === "" ? "true" : "false");
				btn.textContent = category === "" ? "Alle" : category;
				return btn;
			});
			container.replaceChildren(...buttons);
		} catch (err) {
			console.error("Fehler beim Laden der Kategorien:", err);
		}
	}

	async function loadPlants(search) {
		try {
			const params = new URLSearchParams();
			if (currentCategory) params.set("category", currentCategory);
			if (search) params.set("search", search);
			const qs = params.toString();

			const res = await fetch(`${API_BASE}/plants${qs ? "?" + qs : ""}`);
			allPlants = await res.json();
			renderPlants(allPlants);
		} catch (err) {
			console.error("Fehler beim Laden der Pflanzen:", err);
			const grid = document.getElementById("plantGrid");
			if (grid) showGridMessage(grid, "Fehler beim Laden");
		}
	}

	// Statuszustände (leer/Fehler) ohne HTML-Parsing aufbauen
	function showGridMessage(grid, title, message, icon) {
		const box = document.createElement("div");
		box.className = "empty-state";
		if (icon) {
			const iconEl = document.createElement("div");
			iconEl.className = "empty-state-icon";
			iconEl.setAttribute("aria-hidden", "true");
			iconEl.textContent = icon;
			box.appendChild(iconEl);
		}
		const heading = document.createElement("h3");
		heading.textContent = title;
		box.appendChild(heading);
		if (message) {
			const text = document.createElement("p");
			text.textContent = message;
			box.appendChild(text);
		}
		grid.replaceChildren(box);
	}

	function renderPlants(plants) {
		const grid = document.getElementById("plantGrid");
		if (!grid) return;

		if (plants.length === 0) {
			showGridMessage(
				grid,
				"Keine Pflanzen gefunden",
				"Versuchen Sie einen anderen Suchbegriff.",
				"🌱",
			);
			return;
		}

		grid.innerHTML = plants
			.map((p) => {
				var safeName = Security.escapeHtml(p.name);
				var safeCategory = Security.escapeHtml(p.category);
				var diffLabel =
					{ easy: "Einfach", medium: "Mittel", hard: "Schwer" }[p.difficulty] ||
					p.difficulty;
				var sunLabel =
					{ full: "Volle Sonne", partial: "Halbschatten", shade: "Schatten" }[
						p.sun
					] || p.sun;
				var waterLabel =
					{ low: "Wenig", medium: "Mittel", high: "Viel" }[p.water] || p.water;

				return `
                <div class="plant-card" data-plant-id="${Security.escapeHtml(p.id)}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${safeName}, ${safeCategory}: Details öffnen">
                    <div class="plant-card-icon" aria-hidden="true">${Security.escapeHtml(p.icon)}</div>
                    <div class="plant-card-body">
                        <h3 class="plant-card-name">${safeName}</h3>
                        <span class="plant-card-category">${safeCategory}</span>
                        <div class="plant-card-tags">
                            <span class="plant-tag difficulty-${Security.escapeHtml(p.difficulty)}">${Security.escapeHtml(diffLabel)}</span>
                            <span class="plant-tag">${Security.escapeHtml(sunLabel)}</span>
                            <span class="plant-tag">${Security.escapeHtml(waterLabel)} Wasser</span>
                        </div>
                    </div>
                </div>
            `;
			})
			.join("");

		grid.querySelectorAll(".plant-card").forEach((card) => {
			card.addEventListener("click", () =>
				openPlantDetail(card.dataset.plantId, card),
			);
			// Karten sind role="button": Enter/Leertaste wie ein nativer Button
			card.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					openPlantDetail(card.dataset.plantId, card);
				}
			});
		});
	}

	function openPlantDetail(plantId, opener) {
		const plant = allPlants.find((p) => p.id === plantId);
		if (!plant) return;

		const modal = document.getElementById("plantModal");
		const content = document.getElementById("plantModalContent");
		if (!modal || !content) return;

		var safeName = Security.escapeHtml(plant.name);
		var safeTips = Security.escapeHtml(plant.tips);
		var safeCategory = Security.escapeHtml(plant.category);
		var diffLabel =
			{ easy: "Einfach", medium: "Mittel", hard: "Schwer" }[plant.difficulty] ||
			plant.difficulty;
		var sunLabel =
			{ full: "Volle Sonne", partial: "Halbschatten", shade: "Schatten" }[
				plant.sun
			] || plant.sun;
		var waterLabel =
			{ low: "Wenig", medium: "Mittel", high: "Viel" }[plant.water] ||
			plant.water;
		var seasons = (plant.season || [])
			.map(
				(s) =>
					({
						spring: "Frühling",
						summer: "Sommer",
						autumn: "Herbst",
						winter: "Winter",
					})[s] || s,
			)
			.join(", ");

		content.innerHTML = `
            <button type="button" class="plant-modal-close" aria-label="Schließen">&times;</button>
            <div class="plant-detail-header">
                <span class="plant-detail-icon" aria-hidden="true">${Security.escapeHtml(plant.icon)}</span>
                <div>
                    <h2 id="plantModalTitle">${safeName}</h2>
                    <span class="plant-card-category">${safeCategory}</span>
                </div>
            </div>
            <div class="plant-detail-grid">
                <div class="plant-detail-item"><strong>Schwierigkeit</strong><span class="plant-tag difficulty-${Security.escapeHtml(plant.difficulty)}">${Security.escapeHtml(diffLabel)}</span></div>
                <div class="plant-detail-item"><strong>Sonne</strong><span>${Security.escapeHtml(sunLabel)}</span></div>
                <div class="plant-detail-item"><strong>Wasser</strong><span>${Security.escapeHtml(waterLabel)}</span></div>
                <div class="plant-detail-item"><strong>Abstand</strong><span>${Security.escapeHtml(plant.spacing)}</span></div>
                <div class="plant-detail-item"><strong>Keimung</strong><span>${Security.escapeHtml(plant.germination)}</span></div>
                <div class="plant-detail-item"><strong>Ernte</strong><span>${Security.escapeHtml(plant.harvest)}</span></div>
                <div class="plant-detail-item"><strong>Saison</strong><span>${Security.escapeHtml(seasons)}</span></div>
            </div>
            <div class="plant-detail-section">
                <h3>Pflegetipps</h3>
                <p>${safeTips}</p>
            </div>
            ${plant.companions.length > 0 ? `<div class="plant-detail-section"><h3>Gute Nachbarn</h3><div class="companion-tags">${plant.companions.map((c) => `<span class="companion-tag good">${Security.escapeHtml(c)}</span>`).join("")}</div></div>` : ""}
            ${plant.avoid.length > 0 ? `<div class="plant-detail-section"><h3>Schlechte Nachbarn</h3><div class="companion-tags">${plant.avoid.map((c) => `<span class="companion-tag bad">${Security.escapeHtml(c)}</span>`).join("")}</div></div>` : ""}
            <div class="plant-detail-actions">
                <button type="button" class="btn btn-primary plant-create-task-btn">Aufgabe erstellen</button>
            </div>
        `;

		lastOpener = opener || document.activeElement;
		modal.style.display = "flex";
		content.querySelector(".plant-modal-close").focus();

		const createBtn = content.querySelector(".plant-create-task-btn");
		if (createBtn) {
			createBtn.addEventListener("click", () => {
				window.location.href = `/index?title=${encodeURIComponent(plant.name + " pflegen")}&location=${encodeURIComponent("Garten")}`;
			});
		}
	}

	function setupEventListeners() {
		const searchInput = document.getElementById("plantSearch");
		if (searchInput) {
			let timeout;
			searchInput.addEventListener("input", () => {
				clearTimeout(timeout);
				timeout = setTimeout(() => loadPlants(searchInput.value.trim()), 300);
			});
		}

		document
			.getElementById("categoryFilters")
			?.addEventListener("click", (e) => {
				const btn = e.target.closest(".category-btn");
				if (!btn) return;
				document.querySelectorAll(".category-btn").forEach((b) => {
					b.classList.remove("active");
					b.setAttribute("aria-pressed", "false");
				});
				btn.classList.add("active");
				btn.setAttribute("aria-pressed", "true");
				currentCategory = btn.dataset.category;
				const searchInput = document.getElementById("plantSearch");
				loadPlants(searchInput?.value?.trim() || "");
			});

		const modal = document.getElementById("plantModal");
		modal?.addEventListener("click", (e) => {
			if (e.target === modal || e.target.closest(".plant-modal-close")) {
				closePlantDetail();
			}
		});

		document.addEventListener("keydown", (e) => {
			const open = modal && modal.style.display !== "none";
			if (!open) return;
			if (e.key === "Escape") {
				closePlantDetail();
			} else if (e.key === "Tab") {
				// Fokus im Dialog halten
				const focusable = modal.querySelectorAll("button:not([disabled])");
				if (focusable.length === 0) return;
				const first = focusable[0];
				const last = focusable[focusable.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		});
	}

	document.addEventListener("DOMContentLoaded", init);
})();
