// Plant Library Module
(function () {
	let allPlants = [];
	let currentCategory = "";
	let lastOpener = null;
	let knownCategories = [];
	let noticeTimer = null;

	// Grenzen wie in src/server/validation/plant-validator.js (der Server bleibt maßgeblich)
	const LIMITS = {
		name: 60,
		category: 40,
		icon: 8,
		spacing: 30,
		germination: 40,
		harvest: 60,
		tips: 1000,
		listItem: 60,
		listLength: 30,
	};
	const SELECTS = {
		difficulty: [
			["easy", "Einfach"],
			["medium", "Mittel"],
			["hard", "Schwer"],
		],
		sun: [
			["full", "Volle Sonne"],
			["partial", "Halbschatten"],
			["shade", "Schatten"],
		],
		water: [
			["low", "Wenig"],
			["medium", "Mittel"],
			["high", "Viel"],
		],
	};
	const SEASONS = [
		["spring", "Frühling"],
		["summer", "Sommer"],
		["autumn", "Herbst"],
		["winter", "Winter"],
	];
	const ANGLE_BRACKETS = /[<>]/;

	// Detail-Dialog schließen; Fokus geht (außer bei restoreFocus=false) zum auslösenden Element
	function closePlantDetail(restoreFocus = true) {
		const modal = document.getElementById("plantModal");
		if (!modal || modal.style.display === "none") return null;
		const opener = lastOpener;
		modal.style.display = "none";
		lastOpener = null;
		if (restoreFocus && opener && opener.focus) opener.focus();
		return opener;
	}

	// DOM-Builder ohne HTML-Parsing: Nutzerdaten landen nur als Text oder Attributwert im DOM
	function el(tag, props = {}, children = []) {
		const node = document.createElement(tag);
		Object.entries(props).forEach(([key, value]) => {
			if (key === "text") node.textContent = value;
			else if (key === "className") node.className = value;
			else node.setAttribute(key, value);
		});
		node.append(...children);
		return node;
	}

	async function init() {
		await loadCategories();
		await loadPlants();
		setupEventListeners();
	}

	async function loadCategories() {
		try {
			const categories = await window.TaskAPI._fetch("/plant-categories");
			knownCategories = categories;
			// Eine Kategorie, die es nach Ändern/Löschen nicht mehr gibt, wäre ein leerer Filter
			if (currentCategory && !categories.includes(currentCategory)) {
				currentCategory = "";
			}
			const container = document.getElementById("categoryFilters");
			if (!container) return;

			// Kategorienamen kommen vom Server: nur als Text rendern
			const buttons = ["", ...categories].map((category) => {
				const active = category === currentCategory;
				const btn = document.createElement("button");
				btn.type = "button";
				btn.className = "category-btn" + (active ? " active" : "");
				btn.dataset.category = category;
				btn.setAttribute("aria-pressed", active ? "true" : "false");
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

			allPlants = await window.TaskAPI._fetch(`/plants${qs ? "?" + qs : ""}`);
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

				// Der zugängliche Name enthält den gesamten sichtbaren Text in dieser Reihenfolge
				// (WCAG 2.5.3 "Label in Name"; axe label-content-name-mismatch).
				return `
                <div class="plant-card" data-plant-id="${Security.escapeHtml(p.id)}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${safeName}, ${safeCategory}, ${Security.escapeHtml(diffLabel)}, ${Security.escapeHtml(sunLabel)}, ${Security.escapeHtml(waterLabel)} Wasser: Details öffnen">
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

		const actions = content.querySelector(".plant-detail-actions");
		if (actions) {
			const editBtn = el("button", {
				type: "button",
				className: "btn btn-secondary plant-edit-btn",
				"aria-haspopup": "dialog",
				text: "Bearbeiten",
			});
			const deleteBtn = el("button", {
				type: "button",
				className: "btn btn-secondary plant-delete-btn",
				"aria-haspopup": "dialog",
				text: "Löschen",
			});
			editBtn.addEventListener("click", () =>
				openPlantForm(plant, closePlantDetail(false)),
			);
			deleteBtn.addEventListener("click", () =>
				openDeleteConfirm(plant, closePlantDetail(false)),
			);
			actions.append(editBtn, deleteBtn);
		}

		const createBtn = content.querySelector(".plant-create-task-btn");
		if (createBtn) {
			createBtn.addEventListener("click", () => {
				window.location.href = `/index?title=${encodeURIComponent(plant.name + " pflegen")}&location=${encodeURIComponent("Garten")}`;
			});
		}
	}

	// ---------------------------------------------------------------------
	// Pflege: hinzufügen, bearbeiten, löschen (#330)
	// ---------------------------------------------------------------------

	// Kurze Rückmeldung für alle (role="status" in plants.html), blendet sich selbst aus
	function notify(text) {
		const box = document.getElementById("plantNotice");
		if (!box) return;
		clearTimeout(noticeTimer);
		box.textContent = text;
		noticeTimer = setTimeout(() => {
			box.textContent = "";
		}, 8000);
	}

	async function reloadLibrary() {
		await loadCategories();
		const search = document.getElementById("plantSearch");
		await loadPlants(search?.value?.trim() || "");
	}

	// Fokus nach dem Schließen: auslösendes Element, sonst die neue Karte, sonst "Hinzufügen"
	function restoreFocus(opener, plantId) {
		if (opener && opener.isConnected && opener.focus) {
			opener.focus();
			return;
		}
		if (plantId) {
			const card = Array.from(document.querySelectorAll(".plant-card")).find(
				(c) => c.dataset.plantId === plantId,
			);
			if (card) {
				card.focus();
				return;
			}
		}
		document.getElementById("plantAddBtn")?.focus();
	}

	// Verständliche Meldungen: 400 trägt errors[] (deutsch), 404/409/Netzwerk werden übersetzt
	function describeError(err) {
		if (err.network) {
			return [
				"Der Server ist nicht erreichbar. Bitte Verbindung prüfen und erneut versuchen.",
			];
		}
		if (err.status === 400 && Array.isArray(err.errors) && err.errors.length) {
			return err.errors;
		}
		if (err.status === 409) {
			return [
				"Es gibt bereits eine Pflanze mit dieser ID. Sie wird aus dem Namen abgeleitet, bitte einen anderen Namen wählen.",
			];
		}
		if (err.status === 404) {
			return [
				"Diese Pflanze gibt es nicht mehr, sie wurde vermutlich bereits gelöscht.",
			];
		}
		if (err.status === 401) {
			return [
				"Der API-Key fehlt oder wurde abgelehnt. Bitte den API-Key eingeben und erneut versuchen.",
			];
		}
		if (err.status === 429) {
			return ["Zu viele Anfragen. Bitte einen Moment warten."];
		}
		return [`Der Server meldet einen Fehler: ${err.message || "unbekannt"}`];
	}

	function trapFocus(modal, event) {
		const focusable = Array.from(
			modal.querySelectorAll(
				"button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
			),
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	// Modalen Dialog anzeigen: Escape (onCancel), Fokusfalle, optional Klick auf den Hintergrund
	function showDialog(modal, { focusEl, onCancel, backdropCancels = false }) {
		modal.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onCancel();
			} else if (event.key === "Tab") {
				trapFocus(modal, event);
			}
		});
		if (backdropCancels) {
			modal.addEventListener("click", (event) => {
				if (event.target === modal) onCancel();
			});
		}
		document.body.appendChild(modal);
		modal.style.display = "flex";
		focusEl.focus();
		return () => modal.remove();
	}

	function errorList(messages) {
		return messages.map((message) => el("li", { text: message }));
	}

	// ----- Formular -----

	function cleanLine(value) {
		return value.replace(/\s+/g, " ").trim();
	}

	function splitLines(value) {
		return value
			.split("\n")
			.map(cleanLine)
			.filter((line) => line !== "");
	}

	// Spiegelt die Server-Regeln, damit offensichtliche Fehler ohne Rundreise erscheinen.
	// Ergebnis: [{ field, message }]
	function validateForm(data) {
		const problems = [];
		const add = (field, message) => problems.push({ field, message });
		const text = (field, label, max, required) => {
			const value = cleanLine(data[field]);
			if (required && value === "") {
				add(field, `${label} muss angegeben werden (max ${max} Zeichen)`);
			} else if (value.length > max) {
				add(field, `${label} darf maximal ${max} Zeichen lang sein`);
			} else if (ANGLE_BRACKETS.test(value)) {
				add(field, `${label} darf keine spitzen Klammern (< >) enthalten`);
			}
		};
		text("name", "Name", LIMITS.name, true);
		text("category", "Kategorie", LIMITS.category, true);
		const iconLength = [...cleanLine(data.icon)].length;
		if (iconLength < 1 || iconLength > LIMITS.icon) {
			add("icon", `Icon muss zwischen 1 und ${LIMITS.icon} Zeichen lang sein`);
		} else if (ANGLE_BRACKETS.test(data.icon)) {
			add("icon", "Icon darf keine spitzen Klammern (< >) enthalten");
		}
		text("spacing", "Abstand", LIMITS.spacing, false);
		text("germination", "Keimdauer", LIMITS.germination, false);
		text("harvest", "Erntezeit", LIMITS.harvest, false);
		[
			["companions", "Gute Nachbarn"],
			["avoid", "Schlechte Nachbarn"],
		].forEach(([field, label]) => {
			const items = data[field];
			if (items.length > LIMITS.listLength) {
				add(field, `${label}: maximal ${LIMITS.listLength} Einträge erlaubt`);
				return;
			}
			items.forEach((item, i) => {
				if (item.length > LIMITS.listItem) {
					add(
						field,
						`${label}, Eintrag ${i + 1}: maximal ${LIMITS.listItem} Zeichen erlaubt`,
					);
				} else if (ANGLE_BRACKETS.test(item)) {
					add(
						field,
						`${label}, Eintrag ${i + 1}: keine spitzen Klammern (< >) erlaubt`,
					);
				}
			});
		});
		const tips = data.tips.trim();
		if (tips.length > LIMITS.tips) {
			add("tips", `Tipps dürfen maximal ${LIMITS.tips} Zeichen lang sein`);
		} else if (ANGLE_BRACKETS.test(tips)) {
			add("tips", "Tipps dürfen keine spitzen Klammern (< >) enthalten");
		}
		return problems;
	}

	function openPlantForm(plant, opener) {
		const editing = Boolean(plant);
		const values = plant || {
			icon: "🌱",
			difficulty: "medium",
			sun: "full",
			water: "medium",
			season: [],
			companions: [],
			avoid: [],
		};
		const controls = {};
		let busy = false;

		const describedBy = (key, hint) => (hint ? `plantForm-${key}-hint` : "");
		// Beschriftetes Feld; Hinweis (Grenze, Format) hängt per aria-describedby am Control
		const group = (key, label, control, { required, hint } = {}) => {
			control.id = `plantForm-${key}`;
			if (required) control.setAttribute("aria-required", "true");
			if (hint)
				control.setAttribute("aria-describedby", describedBy(key, hint));
			controls[key] = control;
			const labelEl = el("label", { for: control.id, text: label });
			if (required) {
				labelEl.append(
					" ",
					el("span", {
						className: "required-indicator",
						"aria-hidden": "true",
						text: "*",
					}),
				);
			}
			const children = [labelEl, control];
			if (hint) {
				children.push(
					el("small", {
						id: describedBy(key, hint),
						className: "plant-form-hint",
						text: hint,
					}),
				);
			}
			return el("div", { className: "form-group" }, children);
		};
		const input = (value, attrs = {}) => {
			const node = el("input", { type: "text", autocomplete: "off", ...attrs });
			node.value = value || "";
			return node;
		};
		const textarea = (value, rows) => {
			const node = el("textarea", { rows: String(rows) });
			node.value = value || "";
			return node;
		};
		const select = (key) => {
			const node = el(
				"select",
				{},
				SELECTS[key].map(([value, label]) =>
					el("option", { value, text: label }),
				),
			);
			node.value = values[key];
			return node;
		};

		const datalist = el(
			"datalist",
			{ id: "plantFormCategories" },
			knownCategories.map((category) => el("option", { value: category })),
		);
		const categoryInput = input(values.category, {
			list: "plantFormCategories",
		});

		const seasonBoxes = SEASONS.map(([value, label]) => {
			const box = el("input", { type: "checkbox", value });
			box.checked = (values.season || []).includes(value);
			return el("label", { className: "plant-season-option" }, [
				box,
				el("span", { text: label }),
			]);
		});
		const seasonSet = el("fieldset", { className: "plant-form-fieldset" }, [
			el("legend", { text: "Saison" }),
			el("div", { className: "plant-season-options" }, seasonBoxes),
		]);

		const errorBox = el("div", {
			id: "plantFormError",
			className: "plant-form-error",
			role: "alert",
			tabindex: "-1",
		});
		const cancelBtn = el("button", {
			type: "button",
			className: "btn btn-secondary",
			text: "Abbrechen",
		});
		const saveBtn = el("button", {
			type: "submit",
			className: "btn btn-primary",
			text: "Speichern",
		});

		const form = el("form", { novalidate: "" }, [
			errorBox,
			group("name", "Name", input(values.name), {
				required: true,
				hint: `Pflicht, max. ${LIMITS.name} Zeichen`,
			}),
			group("category", "Kategorie", categoryInput, {
				required: true,
				hint: `Pflicht, max. ${LIMITS.category} Zeichen; vorhandene Kategorien werden vorgeschlagen`,
			}),
			datalist,
			group("icon", "Icon (Emoji)", input(values.icon), {
				required: true,
				hint: `1 bis ${LIMITS.icon} Zeichen, z. B. 🍅`,
			}),
			el("div", { className: "plant-form-row" }, [
				group("difficulty", "Schwierigkeit", select("difficulty")),
				group("sun", "Sonne", select("sun")),
				group("water", "Wasser", select("water")),
			]),
			seasonSet,
			el("div", { className: "plant-form-row" }, [
				group("spacing", "Abstand", input(values.spacing), {
					hint: `max. ${LIMITS.spacing} Zeichen`,
				}),
				group("germination", "Keimdauer", input(values.germination), {
					hint: `max. ${LIMITS.germination} Zeichen`,
				}),
				group("harvest", "Erntezeit", input(values.harvest), {
					hint: `max. ${LIMITS.harvest} Zeichen`,
				}),
			]),
			group(
				"companions",
				"Gute Nachbarn",
				textarea((values.companions || []).join("\n"), 3),
				{
					hint: `Ein Eintrag pro Zeile, höchstens ${LIMITS.listLength} Einträge mit je ${LIMITS.listItem} Zeichen`,
				},
			),
			group(
				"avoid",
				"Schlechte Nachbarn",
				textarea((values.avoid || []).join("\n"), 3),
				{
					hint: `Ein Eintrag pro Zeile, höchstens ${LIMITS.listLength} Einträge mit je ${LIMITS.listItem} Zeichen`,
				},
			),
			group("tips", "Pflegetipps", textarea(values.tips, 5), {
				hint: `max. ${LIMITS.tips} Zeichen`,
			}),
			el("div", { className: "modal-actions" }, [cancelBtn, saveBtn]),
		]);

		const modal = el(
			"div",
			{
				id: "plantFormModal",
				className: "modal",
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": "plantFormTitle",
			},
			[
				el("div", { className: "modal-content plant-form-content" }, [
					el("div", { className: "plant-form-header" }, [
						el("h2", {
							id: "plantFormTitle",
							text: editing ? "Pflanze bearbeiten" : "Pflanze hinzufügen",
						}),
					]),
					form,
				]),
			],
		);

		const collect = () => ({
			name: controls.name.value.trim(),
			category: controls.category.value.trim(),
			icon: controls.icon.value.trim(),
			difficulty: controls.difficulty.value,
			sun: controls.sun.value,
			water: controls.water.value,
			season: SEASONS.map(([value]) => value).filter(
				(value) => seasonSet.querySelector(`input[value="${value}"]`).checked,
			),
			spacing: controls.spacing.value.trim(),
			germination: controls.germination.value.trim(),
			harvest: controls.harvest.value.trim(),
			companions: splitLines(controls.companions.value),
			avoid: splitLines(controls.avoid.value),
			tips: controls.tips.value.trim(),
		});

		const clearErrors = () => {
			errorBox.replaceChildren();
			Object.values(controls).forEach((control) => {
				control.removeAttribute("aria-invalid");
				control.classList.remove("invalid");
			});
		};
		const showErrors = (messages) => {
			errorBox.replaceChildren(
				el("p", {
					className: "plant-form-error-title",
					text: "Bitte korrigieren:",
				}),
				el("ul", {}, errorList(messages)),
			);
		};

		let closeDialog = () => {};
		const cancel = () => {
			if (busy) return;
			closeDialog();
			restoreFocus(opener, plant && plant.id);
		};

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			if (busy) return;
			clearErrors();
			const data = collect();
			const problems = validateForm(data);
			if (problems.length > 0) {
				problems.forEach(({ field }) => {
					controls[field].setAttribute("aria-invalid", "true");
					controls[field].classList.add("invalid");
				});
				showErrors(problems.map((p) => p.message));
				controls[problems[0].field].focus();
				return;
			}
			busy = true;
			saveBtn.disabled = true;
			saveBtn.textContent = "Speichern …";
			form.setAttribute("aria-busy", "true");
			try {
				const saved = await window.TaskAPI._fetch(
					editing ? `/plants/${encodeURIComponent(plant.id)}` : "/plants",
					{ method: editing ? "PUT" : "POST", body: JSON.stringify(data) },
				);
				closeDialog();
				await reloadLibrary();
				notify(
					editing
						? `„${saved.name}“ wurde gespeichert.`
						: `„${saved.name}“ wurde hinzugefügt.`,
				);
				restoreFocus(editing ? opener : null, saved.id);
			} catch (err) {
				busy = false;
				saveBtn.disabled = false;
				saveBtn.textContent = "Speichern";
				form.removeAttribute("aria-busy");
				showErrors(describeError(err));
				errorBox.focus();
				if (err.status === 404) reloadLibrary();
			}
		});
		cancelBtn.addEventListener("click", cancel);

		closeDialog = showDialog(modal, {
			focusEl: controls.name,
			onCancel: cancel,
		});
	}

	// ----- Löschen -----

	function openDeleteConfirm(plant, opener) {
		let busy = false;
		const error = el("p", {
			id: "plantDeleteError",
			className: "plant-form-error",
			role: "alert",
			tabindex: "-1",
		});
		const cancelBtn = el("button", {
			type: "button",
			className: "btn btn-secondary",
			text: "Abbrechen",
		});
		const okBtn = el("button", {
			type: "button",
			className: "btn btn-danger",
			text: "Löschen",
		});
		const modal = el(
			"div",
			{
				id: "plantDeleteModal",
				className: "modal",
				role: "alertdialog",
				"aria-modal": "true",
				"aria-labelledby": "plantDeleteTitle",
				"aria-describedby": "plantDeleteMessage",
			},
			[
				el("div", { className: "modal-content confirm-modal-content" }, [
					el("div", { className: "plant-form-header" }, [
						el("h2", { id: "plantDeleteTitle", text: "Pflanze löschen?" }),
					]),
					el("div", { className: "plant-confirm-body" }, [
						el("p", {
							id: "plantDeleteMessage",
							text: `„${plant.name}“ wird dauerhaft aus der Pflanzenbibliothek gelöscht. Das lässt sich nicht rückgängig machen.`,
						}),
						error,
					]),
					el("div", { className: "modal-actions" }, [cancelBtn, okBtn]),
				]),
			],
		);

		let closeDialog = () => {};
		const cancel = () => {
			if (busy) return;
			closeDialog();
			restoreFocus(opener, plant.id);
		};
		cancelBtn.addEventListener("click", cancel);
		okBtn.addEventListener("click", async () => {
			if (busy) return;
			busy = true;
			okBtn.disabled = true;
			error.replaceChildren();
			try {
				await window.TaskAPI._fetch(`/plants/${encodeURIComponent(plant.id)}`, {
					method: "DELETE",
				});
				closeDialog();
				await reloadLibrary();
				notify(`„${plant.name}“ wurde gelöscht.`);
				restoreFocus(null, null);
			} catch (err) {
				busy = false;
				okBtn.disabled = false;
				error.textContent = describeError(err).join(" ");
				error.focus();
				if (err.status === 404) reloadLibrary();
			}
		});

		closeDialog = showDialog(modal, {
			focusEl: cancelBtn,
			onCancel: cancel,
			backdropCancels: true,
		});
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

		const addBtn = document.getElementById("plantAddBtn");
		addBtn?.addEventListener("click", () => openPlantForm(null, addBtn));

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
