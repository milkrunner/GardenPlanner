// tab-sync.js - Multi-tab synchronization for GartenPlaner
// Uses BroadcastChannel API with localStorage storage event fallback.
// Must be loaded AFTER app.js defines the GartenPlaner class.

(function () {
	"use strict";

	var CHANNEL_NAME = "gardenplanner-sync";
	var STORAGE_KEY = "gardenplanner-sync-event";

	/**
	 * TabSync manages cross-tab communication so that task changes
	 * (create, update, delete, archive, unarchive) in one tab are
	 * reflected in all other open tabs.
	 */
	function TabSync() {
		this.channel = null;
		this.usesBroadcastChannel = typeof BroadcastChannel !== "undefined";
		this._boundOnStorage = this._onStorageEvent.bind(this);
		this._init();
	}

	TabSync.prototype._init = function () {
		if (this.usesBroadcastChannel) {
			this.channel = new BroadcastChannel(CHANNEL_NAME);
			this.channel.onmessage = this._onMessage.bind(this);
		} else {
			// Fallback: listen for storage events (fires in *other* tabs only)
			window.addEventListener("storage", this._boundOnStorage);
		}

		if (window.logger) {
			window.logger.info("TabSync initialised", "tab-sync", {
				transport: this.usesBroadcastChannel
					? "BroadcastChannel"
					: "storage-event",
			});
		}
	};

	/**
	 * Broadcast a task-changed event to other tabs.
	 * @param {'create'|'update'|'delete'|'archive'|'unarchive'} action
	 * @param {string|number} taskId
	 */
	TabSync.prototype.broadcast = function (action, taskId) {
		var message = {
			type: "task-changed",
			action: action,
			taskId: taskId,
			timestamp: Date.now(),
		};

		if (this.usesBroadcastChannel && this.channel) {
			this.channel.postMessage(message);
		} else {
			// Fallback: write to localStorage so other tabs receive a storage event.
			// We JSON-stringify with a unique timestamp so the value always changes
			// (storage events only fire when the value actually changes).
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
			} catch (e) {
				// localStorage might be full or unavailable — silently ignore
			}
		}

		if (window.logger) {
			window.logger.debug("TabSync broadcast", "tab-sync", message);
		}
	};

	/** Handler for BroadcastChannel messages */
	TabSync.prototype._onMessage = function (event) {
		var data = event.data;
		if (data && data.type === "task-changed") {
			this._handleSyncEvent(data);
		}
	};

	/** Handler for localStorage storage events (fallback) */
	TabSync.prototype._onStorageEvent = function (event) {
		if (event.key !== STORAGE_KEY || !event.newValue) return;
		try {
			var data = JSON.parse(event.newValue);
			if (data && data.type === "task-changed") {
				this._handleSyncEvent(data);
			}
		} catch (e) {
			// Malformed JSON — ignore
		}
	};

	/**
	 * React to a sync event from another tab by reloading tasks and re-rendering.
	 */
	TabSync.prototype._handleSyncEvent = function (data) {
		if (window.logger) {
			window.logger.info("TabSync received sync event", "tab-sync", data);
		}

		var planer = window.gartenPlaner;
		if (!planer) return;

		// Reload tasks from storage/API and re-render
		planer.loadTasks().then(function (tasks) {
			planer.tasks = tasks;
			return planer.loadArchivedTasks();
		}).then(function (archivedTasks) {
			planer.archivedTasks = archivedTasks;
			planer.renderTasks();
			planer.updateStatistics();
			planer.updateEmployeeFilter();
			planer.updateLocationFilter();
		}).catch(function (error) {
			console.error("TabSync: failed to reload tasks", error);
		});
	};

	/** Clean up resources (useful for tests or SPA teardown) */
	TabSync.prototype.destroy = function () {
		if (this.channel) {
			this.channel.close();
			this.channel = null;
		}
		window.removeEventListener("storage", this._boundOnStorage);
	};

	// Instantiate and expose globally
	var tabSync = new TabSync();
	window.tabSync = tabSync;
	window.GP.tabSync = tabSync;
})();
