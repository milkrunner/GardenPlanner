// Log Viewer - Extracted from logs.html (#71)
// Error Handling: DOM-Helper geben null zurück + console.warn (#73)
const logViewer = {
    currentFilters: {},
    autoRefresh: null,

    init() {
        // Event-Listener für Filter
        document.getElementById('filterLevel').addEventListener('change', () => this.applyFilters());
        document.getElementById('filterCategory').addEventListener('change', () => this.applyFilters());
        document.getElementById('filterSearch').addEventListener('input', () => this.applyFilters());
        document.getElementById('filterLimit').addEventListener('change', () => this.applyFilters());

        // Initiales Laden
        this.refresh();

        // Auto-Refresh alle 5 Sekunden
        this.startAutoRefresh();

        console.log('Log Viewer initialisiert');
    },

    applyFilters() {
        const level = document.getElementById('filterLevel').value;
        const category = document.getElementById('filterCategory').value;
        const search = document.getElementById('filterSearch').value;
        const limit = document.getElementById('filterLimit').value;

        this.currentFilters = {
            level: level || undefined,
            category: category || undefined,
            search: search || undefined,
            limit: limit ? parseInt(limit, 10) : undefined
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

        document.getElementById('statTotal').textContent = stats.total;
        document.getElementById('statErrors').textContent = stats.recentErrors;
        document.getElementById('statCategories').textContent = Object.keys(stats.byCategory).length;
        document.getElementById('statSize').textContent = size;
    },

    updateHealth() {
        const health = LoggerHelpers.checkHealth(window.logger);
        const indicator = document.getElementById('healthIndicator');

        indicator.className = 'health-indicator health-' + health.status;
        indicator.textContent = health.status === 'healthy' ? '✓ Healthy' :
                               health.status === 'warning' ? '⚠ Warning' :
                               '✗ Critical';
        indicator.title = health.issues.join(', ') || 'System läuft einwandfrei';
    },

    renderLogs() {
        const logs = window.logger.getLogs(this.currentFilters);
        const tbody = document.getElementById('logTableBody');

        if (logs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div class="empty-state">
                            <div class="empty-state-icon">🔍</div>
                            <p>Keine Logs gefunden</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = logs.map(log => this.createLogRow(log)).join('');
    },

    createLogRow(log) {
        const timestamp = new Date(log.timestamp).toLocaleString('de-DE');
        const contextPreview = Object.keys(log.context).length > 0
            ? `{...}`
            : '-';

        return `
            <tr onclick="logViewer.showDetail('${log.id}')">
                <td class="log-timestamp">${timestamp}</td>
                <td><span class="log-level ${log.level.toLowerCase()}">${log.level}</span></td>
                <td><span class="log-category">${log.category}</span></td>
                <td class="log-message">${this.escapeHtml(log.message)}</td>
                <td class="log-context">${contextPreview}</td>
            </tr>
        `;
    },

    showDetail(logId) {
        const log = window.logger.logs.find(l => l.id === logId);
        if (!log) return;

        const timestamp = new Date(log.timestamp).toLocaleString('de-DE');
        const contextJson = JSON.stringify(log.context, null, 2);

        const content = `
            <div class="log-detail-section">
                <h2><span class="log-level ${log.level.toLowerCase()}">${log.level}</span> ${this.escapeHtml(log.message)}</h2>
            </div>

            <div class="log-detail-section">
                <h3>ℹ️ Informationen</h3>
                <div class="log-detail-json">
                    <strong>Zeitstempel:</strong> ${timestamp}<br>
                    <strong>Kategorie:</strong> ${log.category}<br>
                    <strong>Level:</strong> ${log.level}<br>
                    <strong>ID:</strong> ${log.id}
                </div>
            </div>

            ${Object.keys(log.context).length > 0 ? `
                <div class="log-detail-section">
                    <h3>🔧 Context</h3>
                    <div class="log-detail-json">
                        <pre>${this.escapeHtml(contextJson)}</pre>
                    </div>
                </div>
            ` : ''}

            ${log.context.error && log.context.error.stack ? `
                <div class="log-detail-section">
                    <h3>📋 Stack Trace</h3>
                    <div class="log-detail-json">
                        <pre>${this.escapeHtml(log.context.error.stack)}</pre>
                    </div>
                </div>
            ` : ''}

            <div class="log-detail-section">
                <h3>🌐 Browser</h3>
                <div class="log-detail-json">
                    <strong>User Agent:</strong> ${this.escapeHtml(log.userAgent || 'N/A')}<br>
                    <strong>URL:</strong> ${this.escapeHtml(log.url || 'N/A')}
                </div>
            </div>
        `;

        document.getElementById('logDetailContent').innerHTML = content;
        document.getElementById('logDetailModal').classList.add('active');
    },

    closeDetail() {
        document.getElementById('logDetailModal').classList.remove('active');
    },

    exportJSON() {
        LoggerHelpers.downloadLogs(window.logger, 'json');
    },

    exportCSV() {
        LoggerHelpers.downloadLogs(window.logger, 'csv');
    },

    exportText() {
        LoggerHelpers.downloadLogs(window.logger, 'text');
    },

    clearLogs() {
        if (confirm('Möchten Sie wirklich alle Logs löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden!')) {
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Initialisiere beim Laden
window.addEventListener('DOMContentLoaded', () => {
    logViewer.init();
});

// Modal bei Klick außerhalb schließen
document.getElementById('logDetailModal').addEventListener('click', (e) => {
    if (e.target.id === 'logDetailModal') {
        logViewer.closeDetail();
    }
});
