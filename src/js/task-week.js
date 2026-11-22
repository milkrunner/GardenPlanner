// task-week.js - Wochenansicht der Aufgaben nach Fälligkeit (#348), nur auf dem Dashboard
// Extends GartenPlaner.prototype - must be loaded AFTER app.js and task-filters.js/task-renderer.js
// (nutzt parseDueDate, formatIsoDate, shiftIsoDate, getDueStatus, _el) und BEFORE task-events.js.
// Do NOT add defer or async to script tags.
//
// Tage sind reine Kalendertage `YYYY-MM-DD` (wie `dueDate`). Wochen beginnen am Montag. Es wird nie mit
// Millisekunden (+ 24 h) gerechnet, sondern über Jahr/Monat/Tag: so bleibt jeder Tag auch an der
// Sommerzeitumstellung ein Tag. Aufgabendaten erscheinen nur über DOM-Builder (textContent).

var WEEK_LOCALE = "de-DE";

// Montag der Woche, in der `iso` liegt (Sonntag gehört zur Woche davor); null bei ungültigem Datum.
GartenPlaner.prototype.getWeekStart = function (iso) {
	var date = this.parseDueDate(iso);
	if (!date) return null;
	var sinceMonday = (date.getDay() + 6) % 7;
	return this.shiftIsoDate(iso, -sinceMonday);
};

// Sieben aufeinanderfolgende Tage ab dem Montag `startIso`.
GartenPlaner.prototype.getWeekDays = function (startIso) {
	var days = [];
	for (var i = 0; i < 7; i++) {
		var day = this.shiftIsoDate(startIso, i);
		if (!day) return [];
		days.push(day);
	}
	return days;
};

// ISO-8601-Kalenderwoche (Woche mit dem ersten Donnerstag des Jahres ist KW 1).
GartenPlaner.prototype.getIsoWeekNumber = function (iso) {
	var date = this.parseDueDate(iso);
	if (!date) return null;
	// In UTC rechnen: dort gibt es keine Sommerzeit, jeder Tag hat 24 Stunden.
	var thursday = new Date(
		Date.UTC(
			date.getFullYear(),
			date.getMonth(),
			date.getDate() + 3 - ((date.getDay() + 6) % 7),
		),
	);
	var firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
	var dayDiff = Math.round((thursday - firstThursday) / 86400000);
	return 1 + Math.floor((dayDiff + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
};

// Ordnet Aufgaben den Tagen der Woche zu. Aufgaben ohne gültiges Datum landen in `undated`, Aufgaben
// mit Datum außerhalb der Woche in keiner der beiden Gruppen. Offene Aufgaben stehen vor erledigten.
GartenPlaner.prototype.groupTasksByWeek = function (tasks, startIso) {
	var days = this.getWeekDays(startIso);
	var byDay = {};
	days.forEach((day) => {
		byDay[day] = [];
	});
	var undated = [];
	tasks.forEach((task) => {
		if (!this.parseDueDate(task.dueDate)) undated.push(task);
		else if (byDay[task.dueDate]) byDay[task.dueDate].push(task);
	});
	var openFirst = (a, b) =>
		(a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0);
	days.forEach((day) => byDay[day].sort(openFirst));
	undated.sort(openFirst);
	return { days: days, byDay: byDay, undated: undated };
};

// "KW 47: 16.11.2026 – 22.11.2026"
GartenPlaner.prototype.formatWeekTitle = function (startIso) {
	var days = this.getWeekDays(startIso);
	if (days.length === 0) return "";
	var format = (iso) =>
		this.parseDueDate(iso).toLocaleDateString(WEEK_LOCALE, {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
		});
	return `KW ${this.getIsoWeekNumber(startIso)}: ${format(days[0])} – ${format(days[6])}`;
};

// Ein Tag oder eine Aufgabe ohne Termin als Eintrag der Liste; der Knopf öffnet den Bearbeiten-Dialog.
GartenPlaner.prototype._buildWeekTask = function (task, today) {
	var button = this._el("button", "week-task");
	button.type = "button";
	button.dataset.taskId = task.id;
	button.setAttribute("aria-haspopup", "dialog");
	if (task.status === "completed") button.classList.add("completed");
	button.appendChild(this._el("span", "week-task-title", task.title));
	[
		["Standort: ", task.location],
		["Mitarbeiter: ", task.employee],
	].forEach((entry) => {
		if (!entry[1]) return;
		var meta = this._el("span", "week-task-meta");
		meta.appendChild(this._el("span", "sr-only", entry[0]));
		meta.appendChild(document.createTextNode(entry[1]));
		button.appendChild(meta);
	});
	// Zustand als Text, nicht nur als Farbe oder Durchstreichen
	var flags = { done: "Erledigt", overdue: "Überfällig" };
	var flag = flags[this.getDueStatus(task, today)];
	if (!flag && task.status === "completed") flag = flags.done;
	if (flag) button.appendChild(this._el("span", "week-task-flag", flag));
	return button;
};

GartenPlaner.prototype._buildWeekTaskList = function (tasks, today) {
	var list = this._el("ul", "week-task-list");
	tasks.forEach((task) => {
		var item = this._el("li");
		item.appendChild(this._buildWeekTask(task, today));
		list.appendChild(item);
	});
	return list;
};

GartenPlaner.prototype._fillWeekTasks = function (container, tasks, emptyText) {
	container.replaceChildren(
		tasks.length > 0
			? this._buildWeekTaskList(tasks, this.todayString())
			: this._el("p", "week-empty", emptyText),
	);
};

GartenPlaner.prototype.renderWeek = function () {
	var root = document.getElementById("tasksWeek");
	var grid = document.getElementById("weekGrid");
	var undatedBox = document.getElementById("weekUndated");
	var title = document.getElementById("weekTitle");
	if (!root || !grid || !undatedBox || !title) return;

	if (!this.parseDueDate(this.weekStart)) {
		this.weekStart = this.getWeekStart(this.todayString());
	}

	// Nach dem Neuzeichnen (z. B. nach dem Speichern im Dialog) den Fokus auf derselben Aufgabe halten.
	var active = document.activeElement;
	var focusId =
		active && root.contains(active) && active.dataset
			? active.dataset.taskId
			: undefined;

	var today = this.todayString();
	var groups = this.groupTasksByWeek(
		this.getFilteredTasks(this.tasks),
		this.weekStart,
	);
	title.textContent = this.formatWeekTitle(this.weekStart);

	var dayNodes = groups.days.map((iso) => {
		var section = this._el("section", "week-day");
		var headingId = `weekDay-${iso}`;
		section.setAttribute("aria-labelledby", headingId);
		var heading = this._el("h4", "week-day-title");
		heading.id = headingId;
		var time = this._el(
			"time",
			"",
			this.parseDueDate(iso).toLocaleDateString(WEEK_LOCALE, {
				weekday: "long",
				day: "2-digit",
				month: "2-digit",
			}),
		);
		time.setAttribute("datetime", iso);
		heading.appendChild(time);
		if (iso === today) {
			section.classList.add("week-day-today");
			section.setAttribute("aria-current", "date");
			heading.appendChild(this._el("span", "week-today-flag", "Heute"));
		}
		section.appendChild(heading);
		var body = this._el("div", "week-day-body");
		this._fillWeekTasks(body, groups.byDay[iso], "Keine Aufgaben");
		section.appendChild(body);
		return section;
	});
	grid.replaceChildren(...dayNodes);
	this._fillWeekTasks(
		undatedBox,
		groups.undated,
		"Keine Aufgaben ohne Termin.",
	);

	root.querySelectorAll(".week-task").forEach((button) => {
		var taskId = button.dataset.taskId;
		button.addEventListener("click", () => this.openEditModal(taskId));
	});

	if (focusId !== undefined) {
		var target = Array.from(root.querySelectorAll(".week-task")).find(
			(button) => button.dataset.taskId === focusId,
		);
		(target || title).focus();
	}
};

GartenPlaner.prototype.shiftWeek = function (weeks) {
	var current = this.parseDueDate(this.weekStart)
		? this.weekStart
		: this.getWeekStart(this.todayString());
	this.weekStart = this.shiftIsoDate(current, weeks * 7);
	this.renderWeek();
};

GartenPlaner.prototype.goToCurrentWeek = function () {
	this.weekStart = this.getWeekStart(this.todayString());
	this.renderWeek();
};

// Wechselt zwischen Liste und Wochenansicht. Archiv und Mehrfachauswahl gibt es nur in der Liste.
GartenPlaner.prototype.setView = function (view) {
	var listView = document.getElementById("tasksList");
	var weekView = document.getElementById("tasksWeek");
	if (!listView || !weekView) return;
	var next = view === "week" ? "week" : "list";

	if (next === "week") {
		if (this.showArchive) this.toggleArchiveView();
		if (this.bulkMode) this.toggleBulkMode();
	}
	this.currentView = next;

	var isWeek = next === "week";
	listView.hidden = isWeek;
	weekView.hidden = !isWeek;
	var actions = document.querySelector(".tasks-header-actions");
	if (actions) actions.hidden = isWeek;
	document.querySelectorAll(".view-btn").forEach((btn) => {
		var selected = btn.dataset.view === next;
		btn.classList.toggle("active", selected);
		btn.setAttribute("aria-pressed", String(selected));
	});
	this.renderTasks();
};
