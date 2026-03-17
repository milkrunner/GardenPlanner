// task-filters.js - Search & Filter Logic for GartenPlaner
// Extends GartenPlaner.prototype - must be loaded AFTER app.js defines the class.
// Do NOT add defer or async to script tags.

GartenPlaner.prototype.getFilteredTasks = function () {
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

		return employeeMatch && locationMatch && statusMatch && searchMatch;
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
