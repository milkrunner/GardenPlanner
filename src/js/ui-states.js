// ui-states.js - Unified loading, empty, error, and no-results state components
// Provides reusable HTML rendering functions for consistent state display across the app.
// Must be loaded BEFORE app.js and any module that renders states.

(function () {
	"use strict";

	/**
	 * Renders a loading state with a spinner animation.
	 * @param {string} [message='Laden...'] - The loading message to display.
	 * @returns {string} HTML string for the loading state.
	 */
	function renderLoadingState(message) {
		if (message === undefined) message = "Laden...";
		return '<div class="ui-state ui-state--loading">' +
			'<div class="ui-state__spinner" aria-hidden="true"></div>' +
			'<h3 class="ui-state__title">' + escapeHtml(message) + '</h3>' +
			'</div>';
	}

	/**
	 * Renders an empty state with icon, title, optional subtitle and action button.
	 * @param {string} icon - Emoji or text icon to display.
	 * @param {string} title - Main title text.
	 * @param {string} [subtitle] - Optional subtitle/description text.
	 * @param {string} [actionHtml] - Optional HTML string for an action button.
	 * @returns {string} HTML string for the empty state.
	 */
	function renderEmptyState(icon, title, subtitle, actionHtml) {
		var html = '<div class="ui-state ui-state--empty">' +
			'<div class="ui-state__icon">' + escapeHtml(icon) + '</div>' +
			'<h3 class="ui-state__title">' + escapeHtml(title) + '</h3>';
		if (subtitle) {
			html += '<p class="ui-state__subtitle">' + escapeHtml(subtitle) + '</p>';
		}
		if (actionHtml) {
			html += '<div class="ui-state__action">' + actionHtml + '</div>';
		}
		html += '</div>';
		return html;
	}

	/**
	 * Renders an error state with message and optional retry button.
	 * @param {string} message - The error message to display.
	 * @param {Function} [retryCallback] - Optional callback function for a retry button.
	 * @returns {string} HTML string for the error state.
	 */
	function renderErrorState(message, retryCallback) {
		var retryId = retryCallback ? "uiStateRetry_" + Date.now() : null;
		var html = '<div class="ui-state ui-state--error">' +
			'<div class="ui-state__icon">&#x26A0;&#xFE0F;</div>' +
			'<h3 class="ui-state__title">Etwas ist schiefgelaufen</h3>' +
			'<p class="ui-state__subtitle">' + escapeHtml(message) + '</p>';
		if (retryCallback) {
			html += '<div class="ui-state__action">' +
				'<button class="btn btn-secondary ui-state__retry-btn" id="' + retryId + '">Erneut versuchen</button>' +
				'</div>';
		}
		html += '</div>';

		// Attach retry callback after render via microtask
		if (retryCallback && retryId) {
			setTimeout(function () {
				var btn = document.getElementById(retryId);
				if (btn) {
					btn.addEventListener("click", retryCallback);
				}
			}, 0);
		}

		return html;
	}

	/**
	 * Renders a no-results state for search queries.
	 * @param {string} searchTerm - The search term that yielded no results.
	 * @returns {string} HTML string for the no-results state.
	 */
	function renderNoResultsState(searchTerm) {
		return '<div class="ui-state ui-state--no-results">' +
			'<div class="ui-state__icon">&#x1F50D;</div>' +
			'<h3 class="ui-state__title">Keine Ergebnisse</h3>' +
			'<p class="ui-state__subtitle">Keine Treffer f\u00fcr \u201e' + escapeHtml(searchTerm) + '\u201c gefunden.</p>' +
			'<p class="ui-state__hint">Versuchen Sie einen anderen Suchbegriff.</p>' +
			'</div>';
	}

	/**
	 * Minimal HTML escaping for user-provided text.
	 */
	function escapeHtml(str) {
		if (typeof Security !== "undefined" && Security.escapeHtml) {
			return Security.escapeHtml(str);
		}
		var div = document.createElement("div");
		div.appendChild(document.createTextNode(str));
		return div.innerHTML;
	}

	// Export to global scope
	window.UIStates = {
		renderLoadingState: renderLoadingState,
		renderEmptyState: renderEmptyState,
		renderErrorState: renderErrorState,
		renderNoResultsState: renderNoResultsState,
	};
	window.GP = window.GP || {};
	window.GP.UIStates = window.UIStates;
})();
