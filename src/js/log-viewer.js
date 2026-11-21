// Log Viewer - Extracted from logs.html (#71)
// Error Handling: DOM-Helper geben null zurück + console.warn (#73)
const logViewer = {
	currentFilters: {},
	autoRefresh: null,

	init() {
		// Event-Listener für Filter
		document
			.getElementById("filterLevel")
			.addEventListener("change", () => this.applyFilters());
		document
			.getElementById("filterCategory")
			.addEventListener("change", () => this.applyFilters());
		document
			.getElementById("filterSearch")
			.addEventListener("input", () => this.applyFilters());
		document
			.getElementById("filterLimit")
			.addEventListener("change", () => this.applyFilters());

		// Button event listeners (#12: extracted from inline onclick)
		const bind = (id, fn) => {
			const el = document.getElementById(id);
			if (el) el.addEventListener("click", () => fn());
		};
		bind("logRefreshBtn", () => this.refresh());
		bind("logExportJsonBtn", () => this.exportJSON());
		bind("logExportCsvBtn", () => this.exportCSV());
		bind("logExportTextBtn", () => this.exportText());
		bind("logClearBtn", () => this.clearLogs());
		bind("logDetailCloseBtn", () => this.closeDetail());

		// Initiales Laden
		this.refresh();

		// Auto-Refresh alle 5 Sekunden
		this.startAutoRefresh();

		window.GP?.debug?.("Log Viewer initialisiert");
	},

	applyFilters() {
		const level = document.getElementById("filterLevel").value;
		const category = document.getElementById("filterCategory").value;
		const search = document.getElementById("filterSearch").value;
		const limit = document.getElementById("filterLimit").value;

		this.currentFilters = {
			level: level || undefined,
			category: category || undefined,
			search: search || undefined,
			limit: limit ? parseInt(limit, 10) : undefined,
		};

		this.renderLogs();
	},

	refresh() {
		this.updateStats();
		this.renderLogs();
		this.updateHealth();
	},

	updateStats() {
		const stats = window.logger.getStatistics();
		const size = LoggerHelpers.formatLogSize(window.logger.logs);

		document.getElementById("statTotal").textContent = stats.total;
		document.getElementById("statErrors").textContent = stats.recentErrors;
		document.getElementById("statCategories").textContent = Object.keys(
			stats.byCategory,
		).length;
		document.getElementById("statSize").textContent = size;
	},

	updateHealth() {
		const health = LoggerHelpers.checkHealth(window.logger);
		const indicator = document.getElementById("healthIndicator");

		indicator.className = "health-indicator health-" + health.status;
		indicator.textContent =
			health.status === "healthy"
				? "✓ Healthy"
				: health.status === "warning"
					? "⚠ Warning"
					: "✗ Critical";
		indicator.title = health.issues.join(", ") || "System läuft einwandfrei";
	},

	renderLogs() {
		const logs = window.logger.getLogs(this.currentFilters);
		const tbody = document.getElementById("logTableBody");

		if (logs.length === 0) {
			const icon = document.createElement("div");
			icon.className = "empty-state-icon";
			icon.setAttribute("aria-hidden", "true");
			icon.textContent = "🔍";
			const text = document.createElement("p");
			text.textContent = "Keine Logs gefunden";
			const box = document.createElement("div");
			box.className = "empty-state";
			box.append(icon, text);
			const cell = document.createElement("td");
			cell.colSpan = 5;
			cell.appendChild(box);
			const row = document.createElement("tr");
			row.appendChild(cell);
			tbody.replaceChildren(row);
			return;
		}

		// Auto-Refresh darf den Tastaturfokus nicht verlieren
		const focusedId = tbody.contains(document.activeElement)
			? document.activeElement.dataset.logId
			: null;
		tbody.replaceChildren(...logs.map((log) => this.createLogRow(log)));
		if (focusedId) {
			Array.from(tbody.rows)
				.find((row) => row.dataset.logId === focusedId)
				?.focus();
		}
	},

	// Log-Daten sind untrusted (Nachrichten können Task-Inhalte enthalten):
	// alle Zellen werden per textContent gesetzt.
	createLogRow(log) {
		const cell = (className, text) => {
			const td = document.createElement("td");
			if (className) td.className = className;
			if (text !== undefined) td.textContent = text;
			return td;
		};
		const badge = (className, text) => {
			const span = document.createElement("span");
			span.className = className;
			span.textContent = text;
			const td = document.createElement("td");
			td.appendChild(span);
			return td;
		};

		const row = document.createElement("tr");
		row.dataset.logId = log.id;
		row.className = "log-row-clickable";
		// Tastaturbedienung: Enter/Leertaste öffnet das Detail (siehe Delegation unten)
		row.tabIndex = 0;
		row.setAttribute("aria-haspopup", "dialog");
		row.append(
			cell("log-timestamp", new Date(log.timestamp).toLocaleString("de-DE")),
			badge(`log-level ${String(log.level).toLowerCase()}`, log.level),
			badge("log-category", log.category),
			cell("log-message", log.message),
			cell("log-context", Object.keys(log.context).length > 0 ? "{...}" : "-"),
		);
		return row;
	},

	showDetail(logId) {
		const log = window.logger.logs.find((l) => l.id === logId);
		if (!log) return;

		const timestamp = new Date(log.timestamp).toLocaleString("de-DE");
		const contextJson = JSON.stringify(log.context, null, 2);

		const content = `
            <div class="log-detail-section">
                <h2><span class="log-level ${this.escapeHtml(String(log.level).toLowerCase())}">${this.escapeHtml(log.level)}</span> ${this.escapeHtml(log.message)}</h2>
            </div>

            <div class="log-detail-section">
                <h3>ℹ️ Informationen</h3>
                <div class="log-detail-json">
                    <strong>Zeitstempel:</strong> ${timestamp}<br>
                    <strong>Kategorie:</strong> ${this.escapeHtml(log.category)}<br>
                    <strong>Level:</strong> ${this.escapeHtml(log.level)}<br>
                    <strong>ID:</strong> ${this.escapeHtml(log.id)}
                </div>
            </div>

            ${
							Object.keys(log.context).length > 0
								? `
                <div class="log-detail-section">
                    <h3>🔧 Context</h3>
                    <div class="log-detail-json">
                        <pre>${this.escapeHtml(contextJson)}</pre>
                    </div>
                </div>
            `
								: ""
						}

            ${
							log.context.error && log.context.error.stack
								? `
                <div class="log-detail-section">
                    <h3>📋 Stack Trace</h3>
                    <div class="log-detail-json">
                        <pre>${this.escapeHtml(log.context.error.stack)}</pre>
                    </div>
                </div>
            `
								: ""
						}

            <div class="log-detail-section">
                <h3>🌐 Browser</h3>
                <div class="log-detail-json">
                    <strong>User Agent:</strong> ${this.escapeHtml(log.userAgent || "N/A")}<br>
                    <strong>URL:</strong> ${this.escapeHtml(log.url || "N/A")}
                </div>
            </div>
        `;

		document.getElementById("logDetailContent").innerHTML = content;
		this.lastFocus = document.activeElement;
		document.getElementById("logDetailModal").classList.add("active");
		document.getElementById("logDetailCloseBtn")?.focus();
	},

	closeDetail() {
		document.getElementById("logDetailModal").classList.remove("active");
		if (this.lastFocus && this.lastFocus.isConnected) this.lastFocus.focus();
		this.lastFocus = null;
	},

	exportJSON() {
		LoggerHelpers.downloadLogs(window.logger, "json");
	},

	exportCSV() {
		LoggerHelpers.downloadLogs(window.logger, "csv");
	},

	exportText() {
		LoggerHelpers.downloadLogs(window.logger, "text");
	},

	clearLogs() {
		if (
			confirm(
				"Möchten Sie wirklich alle Logs löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden!",
			)
		) {
			window.logger.clear();
			this.refresh();
		}
	},

	startAutoRefresh() {
		this.autoRefresh = setInterval(() => {
			this.refresh();
		}, 5000);
	},

	stopAutoRefresh() {
		if (this.autoRefresh) {
			clearInterval(this.autoRefresh);
		}
	},

	// Escaping für Text- und Attributkontext (inkl. Anführungszeichen)
	escapeHtml(text) {
		return String(text ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	},
};

// Initialisiere beim Laden
window.addEventListener("DOMContentLoaded", () => {
	logViewer.init();

	// Event delegation for log row clicks (#12)
	document.getElementById("logTableBody").addEventListener("click", (e) => {
		const row = e.target.closest("tr[data-log-id]");
		if (row) logViewer.showDetail(row.dataset.logId);
	});

	document.getElementById("logTableBody").addEventListener("keydown", (e) => {
		if (e.key !== "Enter" && e.key !== " ") return;
		const row = e.target.closest("tr[data-log-id]");
		if (row && e.target === row) {
			e.preventDefault();
			logViewer.showDetail(row.dataset.logId);
		}
	});

	document.addEventListener("keydown", (e) => {
		const modal = document.getElementById("logDetailModal");
		if (e.key === "Escape" && modal.classList.contains("active")) {
			logViewer.closeDetail();
		}
	});

	// Modal bei Klick außerhalb schließen
	document.getElementById("logDetailModal").addEventListener("click", (e) => {
		if (e.target.id === "logDetailModal") {
			logViewer.closeDetail();
		}
	});
});
