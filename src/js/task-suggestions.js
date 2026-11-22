// task-suggestions.js - Aussaat- und Ernte-Vorschläge aus den Pflanzendaten (#349), nur auf der Erstellseite
// Extends GartenPlaner.prototype - must be loaded AFTER app.js, task-state.js, task-filters.js and
// task-renderer.js (nutzt parseDueDate, formatIsoDate, shiftIsoDate, todayString, formatDueDate, _el, getPlant,
// _setFieldError, announce) und BEFORE task-events.js. Do NOT add defer or async to script tags.
//
// Vorschläge sind allgemeine Richtwerte ohne Wetter und Regionalklima und werden nie automatisch angelegt:
// "Übernehmen" füllt nur das Erstellformular (Titel, Pflanze, Fälligkeit, Beschreibung). Gespeichert wird erst,
// wenn die Nutzerin oder der Nutzer das Formular absendet, nachdem sie es ändern oder den Standort ergänzen konnten.
//
// Datenquellen der Pflanze: `sowMonths` (Monate 1-12, strukturiert); fehlt es oder ist es leer (ältere eigene
// Bibliothek), gelten die Monate der `season`. Die Dauer bis zur Ernte (und die Keimdauer) stehen in den Freitexten
// `harvest` und `germination` und werden nur gelesen, wenn sie dem Muster "7-14 Tage" / "3 Wochen" folgen; alles
// andere ("mehrjährig", "-", Leerstring) ergibt keinen Termin statt eines erfundenen. Datumsrechnung nur über
// Jahr/Monat/Tag (shiftIsoDate), nie mit Millisekunden: Sommerzeit, Jahreswechsel und Schaltjahre stimmen dann.

var SUGGESTION_SEASON_MONTHS = {
	spring: [3, 4, 5],
	summer: [6, 7, 8],
	autumn: [9, 10, 11],
	winter: [12, 1, 2],
};
var SUGGESTION_MONTH_NAMES = [
	"Januar",
	"Februar",
	"März",
	"April",
	"Mai",
	"Juni",
	"Juli",
	"August",
	"September",
	"Oktober",
	"November",
	"Dezember",
];
// Beginnt ein Aussaatfenster später als in dieser Zahl Tagen, ist es (noch) kein Vorschlag.
var SUGGESTION_LOOKAHEAD_DAYS = 30;
var SUGGESTION_MAX_DATE = "2100-12-31"; // wie die Obergrenze von dueDate

// "7-14 Tage" -> {min: 7, max: 14}, "3 Wochen" -> {min: 21, max: 21}; null, wenn nicht lesbar.
GartenPlaner.prototype.parseDurationDays = (text) => {
	if (typeof text !== "string") return null;
	var match =
		/^\s*(\d{1,3})\s*(?:[-–]\s*(\d{1,3}))?\s*(Tag(?:e|en)?|Wochen?)(?![\p{L}])/iu.exec(
			text,
		);
	if (!match) return null;
	var factor = /^w/i.test(match[3]) ? 7 : 1;
	var min = Number(match[1]) * factor;
	var max =
		(match[2] === undefined ? Number(match[1]) : Number(match[2])) * factor;
	if (min < 1 || max < min) return null;
	return { min: min, max: max };
};

// Aussaatmonate einer Pflanze, aufsteigend und ohne Duplikate; [] ohne verwertbare Angabe.
GartenPlaner.prototype.getSowMonths = (plant) => {
	var valid = (m) => Number.isInteger(m) && m >= 1 && m <= 12;
	var months = [];
	if (plant && Array.isArray(plant.sowMonths)) {
		months = plant.sowMonths.filter(valid);
	}
	if (months.length === 0 && plant && Array.isArray(plant.season)) {
		plant.season.forEach((season) => {
			if (Object.hasOwn(SUGGESTION_SEASON_MONTHS, season)) {
				months = months.concat(SUGGESTION_SEASON_MONTHS[season]);
			}
		});
	}
	return [...new Set(months)].sort((a, b) => a - b);
};

// Frühester Aussaattag ab `todayIso`: heute, wenn der aktuelle Monat passt, sonst der Erste des nächsten
// passenden Monats (auch über den Jahreswechsel). null ohne Monate oder bei ungültigem Datum.
GartenPlaner.prototype.findSowDate = function (months, todayIso) {
	var today = this.parseDueDate(todayIso);
	if (!today || !Array.isArray(months) || months.length === 0) return null;
	for (var offset = 0; offset < 12; offset++) {
		var first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
		if (!months.includes(first.getMonth() + 1)) continue;
		return {
			date: offset === 0 ? todayIso : this.formatIsoDate(first),
			now: offset === 0,
		};
	}
	return null;
};

// Vorschlag für eine Pflanze am Tag `todayIso`, oder null, wenn nichts anzubieten ist (keine Monate, Aussaatfenster
// liegt weiter als SUGGESTION_LOOKAHEAD_DAYS entfernt). `harvest` ist null, wenn die Erntedauer nicht lesbar ist.
GartenPlaner.prototype.getPlantingSuggestion = function (plant, todayIso) {
	if (!plant || typeof plant.id !== "string") return null;
	var months = this.getSowMonths(plant);
	var sow = this.findSowDate(months, todayIso);
	if (!sow) return null;
	if (sow.date > this.shiftIsoDate(todayIso, SUGGESTION_LOOKAHEAD_DAYS)) {
		return null;
	}
	var harvestDays = this.parseDurationDays(plant.harvest);
	var harvest = null;
	if (harvestDays) {
		var from = this.shiftIsoDate(sow.date, harvestDays.min);
		var to = this.shiftIsoDate(sow.date, harvestDays.max);
		if (from && to && to <= SUGGESTION_MAX_DATE) {
			harvest = { from: from, to: to, days: harvestDays };
		}
	}
	return {
		plantId: plant.id,
		sowDate: sow.date,
		sowNow: sow.now,
		sowMonths: months,
		germinationDays: this.parseDurationDays(plant.germination),
		harvest: harvest,
	};
};

// Alle Vorschläge: "jetzt möglich" zuerst, dann nach Beginn des Fensters, dann nach Name.
GartenPlaner.prototype.getPlantingSuggestions = function (plants, todayIso) {
	if (!Array.isArray(plants)) return [];
	return plants
		.map((plant) => {
			var suggestion = this.getPlantingSuggestion(plant, todayIso);
			return suggestion ? { plant: plant, suggestion: suggestion } : null;
		})
		.filter(Boolean)
		.sort((a, b) => {
			if (a.suggestion.sowNow !== b.suggestion.sowNow) {
				return a.suggestion.sowNow ? -1 : 1;
			}
			if (a.suggestion.sowDate !== b.suggestion.sowDate) {
				return a.suggestion.sowDate < b.suggestion.sowDate ? -1 : 1;
			}
			return String(a.plant.name).localeCompare(String(b.plant.name), "de");
		});
};

// [3,4,5] -> "März–Mai", [12,1,2] -> "Dezember–Februar", [3,5] -> "März, Mai"
GartenPlaner.prototype.formatMonthRanges = (months) => {
	var sorted = [...new Set(months)].sort((a, b) => a - b);
	var runs = [];
	sorted.forEach((month) => {
		var last = runs[runs.length - 1];
		if (last && last[1] === month - 1) last[1] = month;
		else runs.push([month, month]);
	});
	// Dezember und Januar bilden zusammen einen Zeitraum über den Jahreswechsel
	if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1][1] === 12) {
		var first = runs.shift();
		runs[runs.length - 1][1] = first[1] + 12;
	}
	var name = (month) => SUGGESTION_MONTH_NAMES[(month - 1) % 12];
	return runs
		.map((run) =>
			run[0] === run[1] ? name(run[0]) : `${name(run[0])}–${name(run[1])}`,
		)
		.join(", ");
};

GartenPlaner.prototype.formatDurationRange = (days) =>
	days.min === days.max ? `${days.min}` : `${days.min}–${days.max}`;

// Titel, Datum und Beschreibung der Aufgabe, die ein Vorschlag vorbelegt. kind: "sow" oder "harvest".
GartenPlaner.prototype.buildSuggestionTask = function (
	plant,
	suggestion,
	kind,
) {
	var note = "Richtwert aus den Pflanzendaten, ohne regionales Klima.";
	if (kind === "harvest" && suggestion.harvest) {
		return {
			title: `${plant.name} ernten`,
			dueDate: suggestion.harvest.from,
			plantId: plant.id,
			description:
				`Frühestens ab ${this.formatDueDate(suggestion.harvest.from)} ` +
				`(${this.formatDurationRange(suggestion.harvest.days)} Tage nach Aussaat am ` +
				`${this.formatDueDate(suggestion.sowDate)}). ${note}`,
		};
	}
	var germination = suggestion.germinationDays
		? ` Keimung nach ca. ${this.formatDurationRange(suggestion.germinationDays)} Tagen.`
		: "";
	return {
		title: `${plant.name} aussäen`,
		dueDate: suggestion.sowDate,
		plantId: plant.id,
		description: `Aussaatzeit: ${this.formatMonthRanges(suggestion.sowMonths)}.${germination} ${note}`,
	};
};

// Übernimmt einen Vorschlag ins Erstellformular. Legt nichts an: der Standort (Pflichtfeld) fehlt bewusst noch.
GartenPlaner.prototype.applySuggestion = function (plantId, kind) {
	var plant = this.getPlant(plantId);
	if (!plant) return false;
	var suggestion = this.getPlantingSuggestion(plant, this.todayString());
	if (!suggestion) return false;
	var task = this.buildSuggestionTask(plant, suggestion, kind);

	var set = (id, value) => {
		var field = document.getElementById(id);
		if (field) field.value = value;
	};
	set("taskTitle", task.title);
	set("taskDueDate", task.dueDate);
	set("taskDescription", task.description);
	this.populatePlantSelect("taskPlant", task.plantId);
	["taskTitle", "taskLocation", "taskDueDate"].forEach((id) =>
		this._setFieldError(id, ""),
	);

	var location = document.getElementById("taskLocation");
	var target = location && !location.value.trim() ? location : null;
	var form = document.getElementById("taskForm");
	if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
	(target || document.getElementById("taskTitle"))?.focus({
		preventScroll: true,
	});
	this.announce(
		`Vorschlag "${task.title}" ins Formular übernommen. Bitte prüfen, den Standort ergänzen und die Aufgabe hinzufügen.`,
	);
	return true;
};

GartenPlaner.prototype._buildSuggestionItem = function (entry) {
	var plant = entry.plant;
	var suggestion = entry.suggestion;
	var item = this._el("li", "suggestion-item");

	var heading = this._el("h3", "suggestion-title");
	heading.appendChild(this._el("span", "", plant.icon || ""));
	heading.firstChild.setAttribute("aria-hidden", "true");
	heading.appendChild(document.createTextNode(` ${plant.name}`));
	item.appendChild(heading);

	var lines = this._el("ul", "suggestion-lines");
	var addLine = (label, text) => {
		var line = this._el("li");
		line.appendChild(this._el("strong", "", `${label}: `));
		line.appendChild(document.createTextNode(text));
		lines.appendChild(line);
	};
	var months = this.formatMonthRanges(suggestion.sowMonths);
	addLine(
		"Aussaat",
		suggestion.sowNow
			? `jetzt möglich (Aussaatzeit ${months})`
			: `möglich ab ${this.formatDueDate(suggestion.sowDate)} (Aussaatzeit ${months})`,
	);
	if (suggestion.germinationDays) {
		addLine(
			"Keimung",
			`nach ca. ${this.formatDurationRange(suggestion.germinationDays)} Tagen`,
		);
	}
	if (suggestion.harvest) {
		var harvest = suggestion.harvest;
		addLine(
			"Ernte",
			`frühestens ab ${this.formatDueDate(harvest.from)} ` +
				`(${this.formatDurationRange(harvest.days)} Tage nach Aussaat am ${this.formatDueDate(suggestion.sowDate)})`,
		);
	} else {
		var raw = typeof plant.harvest === "string" ? plant.harvest.trim() : "";
		addLine(
			"Ernte",
			raw
				? `${raw} (kein Erntetermin berechenbar)`
				: "keine Angabe, kein Erntetermin berechenbar",
		);
	}
	item.appendChild(lines);

	var actions = this._el("div", "suggestion-actions");
	var addButton = (kind, label) => {
		var button = this._el("button", "btn btn-secondary", label);
		button.type = "button";
		button.dataset.plantId = plant.id;
		button.dataset.kind = kind;
		// Sichtbarer Text steht am Anfang des zugänglichen Namens (WCAG 2.5.3)
		button.setAttribute("aria-label", `${label}: ${plant.name}`);
		actions.appendChild(button);
	};
	addButton("sow", "Aussaat übernehmen");
	if (suggestion.harvest) addButton("harvest", "Ernte übernehmen");
	item.appendChild(actions);
	return item;
};

// Füllt #suggestionsList; ohne geladene Pflanzenbibliothek (Offline-Modus) steht dort ein Hinweis.
GartenPlaner.prototype.renderSuggestions = function () {
	var list = document.getElementById("suggestionsList");
	if (!list) return;
	if (!Array.isArray(this.plants)) {
		list.replaceChildren(
			this._el(
				"li",
				"suggestion-empty",
				"Die Pflanzendaten sind nicht verfügbar, daher gibt es keine Vorschläge.",
			),
		);
		return;
	}
	var entries = this.getPlantingSuggestions(this.plants, this.todayString());
	if (entries.length === 0) {
		list.replaceChildren(
			this._el(
				"li",
				"suggestion-empty",
				`Aktuell gibt es keine Vorschläge: Für keine Pflanze ist jetzt oder in den nächsten ${SUGGESTION_LOOKAHEAD_DAYS} Tagen Aussaatzeit.`,
			),
		);
		return;
	}
	list.replaceChildren(...entries.map((e) => this._buildSuggestionItem(e)));
};
