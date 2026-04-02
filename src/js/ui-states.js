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
	var SVG_EMPTY = '<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="60" cy="105" rx="35" ry="6" fill="currentColor" opacity="0.1"/><path d="M40 95h40v-8c0-2-1-3-3-3H43c-2 0-3 1-3 3v8z" fill="currentColor" opacity="0.15"/><path d="M42 84h36M40 95h40" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M60 80V55" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M60 55c-8-12-22-10-20 0 2 8 12 8 20 0z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="2"/><path d="M60 55c8-12 22-10 20 0-2 8-12 8-20 0z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="2"/><path d="M52 42c-4-8-2-16 4-14s6 10 4 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/><circle cx="54" cy="38" r="2" fill="currentColor" opacity="0.3"/></svg>';
	var SVG_ERROR = '<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="60" cy="105" rx="35" ry="6" fill="currentColor" opacity="0.1"/><path d="M40 95h40v-8c0-2-1-3-3-3H43c-2 0-3 1-3 3v8z" fill="currentColor" opacity="0.15"/><path d="M42 84h36M40 95h40" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M55 80c0 0 2-15 5-25s-2-20-5-22" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/><path d="M65 80c0 0-2-12-3-20" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/><path d="M48 48c-6-4-8-12-4-14s8 2 8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/><path d="M62 40c4-8 12-8 12-2s-6 8-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/><path d="M30 70l12-8M28 60l10-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.2"/></svg>';
	var SVG_SEARCH = '<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="60" cy="105" rx="35" ry="6" fill="currentColor" opacity="0.1"/><rect x="30" y="85" width="60" height="12" rx="3" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="2"/><path d="M38 85v-4M50 85v-6M62 85v-4M74 85v-6M82 85v-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/><circle cx="58" cy="50" r="18" stroke="currentColor" stroke-width="2.5"/><path d="M71 63l12 12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M52 45h12M58 39v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/></svg>';

	function renderEmptyState(icon, title, subtitle, actionHtml) {
		var svgIcon = SVG_EMPTY;
		var html = '<div class="ui-state ui-state--empty">' +
			'<div class="ui-state__icon ui-state__icon--svg">' + svgIcon + '</div>' +
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
			'<div class="ui-state__icon ui-state__icon--svg">' + SVG_ERROR + '</div>' +
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
			'<div class="ui-state__icon ui-state__icon--svg">' + SVG_SEARCH + '</div>' +
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
