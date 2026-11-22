// task-filters.js - Search & Filter Logic for GartenPlaner
// Extends GartenPlaner.prototype - must be loaded AFTER app.js defines the class.
// Do NOT add defer or async to script tags.

// --- Fälligkeit (#346) ---
// `dueDate` ist ein reines Datum `YYYY-MM-DD`. Es wird nie über `new Date("YYYY-MM-DD")` gelesen
// (das wäre UTC-Mitternacht und zeigt westlich von UTC den Vortag), sondern in Jahr/Monat/Tag zerlegt
// und als lokales Datum erzeugt. Verglichen wird als Text: ISO-Datumswerte sortieren lexikografisch.

GartenPlaner.prototype.parseDueDate = (value) => {
	if (typeof value !== "string") return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}
	return date;
};

// Lokales Datum als `YYYY-MM-DD` (nicht toISOString: das wäre UTC).
GartenPlaner.prototype.formatIsoDate = (date) =>
	[
		String(date.getFullYear()).padStart(4, "0"),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");

GartenPlaner.prototype.todayString = function (now = new Date()) {
	return this.formatIsoDate(now);
};

// Deutsche Anzeige, z. B. "Sa., 15.03.2026"; leer bei ungültigem oder fehlendem Datum.
GartenPlaner.prototype.formatDueDate = function (value) {
	const date = this.parseDueDate(value);
	if (!date) return "";
	return date.toLocaleDateString("de-DE", {
		weekday: "short",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
};

// none (kein gültiges Datum), done (erledigt), overdue, today, week (die folgenden 6 Tage), later
GartenPlaner.prototype.getDueStatus = function (task, today) {
	const due = task && task.dueDate;
	if (!this.parseDueDate(due)) return "none";
	if (task.status === "completed") return "done";
	const base = today || this.todayString();
	if (due < base) return "overdue";
	if (due === base) return "today";
	const weekEnd = this.parseDueDate(base);
	weekEnd.setDate(weekEnd.getDate() + 6);
	return due <= this.formatIsoDate(weekEnd) ? "week" : "later";
};

// Aufsteigend nach Fälligkeit, Aufgaben ohne Termin zuletzt (wie sort=dueDate der API).
GartenPlaner.prototype.compareDueDates = function (a, b) {
	const dueA = this.parseDueDate(a.dueDate) ? a.dueDate : null;
	const dueB = this.parseDueDate(b.dueDate) ? b.dueDate : null;
	if (dueA === dueB) return 0;
	if (!dueA) return 1;
	if (!dueB) return -1;
	return dueA < dueB ? -1 : 1;
};

GartenPlaner.prototype.matchesDueFilter = function (task, filter, today) {
	if (!filter) return true;
	const status = this.getDueStatus(task, today);
	if (filter === "none") return status === "none";
	if (filter === "week") return status === "today" || status === "week";
	return status === filter; // overdue, today
};

GartenPlaner.prototype.getFilteredTasks = function () {
	const today = this.currentFilter.due ? this.todayString() : "";
	const tasksToFilter = this.showArchive ? this.archivedTasks : this.tasks;
	return tasksToFilter.filter((task) => {
		const employeeMatch =
			!this.currentFilter.employee ||
			task.employee === this.currentFilter.employee;
		const locationMatch =
			!this.currentFilter.location ||
			task.location === this.currentFilter.location;
		const statusMatch =
			!this.currentFilter.status || task.status === this.currentFilter.status;

		let searchMatch = true;
		if (this.searchQuery) {
			const query = this.searchQuery.toLowerCase();
			searchMatch =
				task.title.toLowerCase().includes(query) ||
				task.employee.toLowerCase().includes(query) ||
				(task.location && task.location.toLowerCase().includes(query)) ||
				(task.description && task.description.toLowerCase().includes(query));
		}

		const dueMatch =
			!this.currentFilter.due ||
			this.matchesDueFilter(task, this.currentFilter.due, today);

		return (
			employeeMatch && locationMatch && statusMatch && dueMatch && searchMatch
		);
	});
};

GartenPlaner.prototype.performSearch = function () {
	const clearBtn = document.getElementById("clearSearchBtn");
	const searchResults = document.getElementById("searchResults");
	const searchResultCount = document.getElementById("searchResultCount");

	if (clearBtn) {
		clearBtn.style.display = this.searchQuery ? "flex" : "none";
	}

	this.renderTasks();

	if (searchResults && searchResultCount && this.searchQuery) {
		const filteredTasks = this.getFilteredTasks();
		searchResultCount.textContent = filteredTasks.length;
		searchResults.style.display = "flex";
	} else if (searchResults) {
		searchResults.style.display = "none";
	}
};

GartenPlaner.prototype.clearSearch = function () {
	const searchInput = document.getElementById("searchInput");
	if (searchInput) {
		searchInput.value = "";
		this.searchQuery = "";
		this.performSearch();
	}
};
