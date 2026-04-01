// confirm-dialog.js - Standalone confirmation dialog utility
// Provides a Promise-based confirmAction() function that can be used anywhere.
// Uses the existing confirmModal DOM element when available, or falls back to
// the GartenPlaner.prototype.showConfirm method.
// Must be loaded BEFORE app.js.

(function () {
	"use strict";

	/**
	 * Shows a modal confirmation dialog and returns a Promise.
	 * @param {Object} options
	 * @param {string} [options.title='Bestaetigung erforderlich'] - Dialog title.
	 * @param {string} [options.message='Moechten Sie fortfahren?'] - Dialog message.
	 * @param {string} [options.icon] - Emoji icon to display.
	 * @param {string} [options.confirmText='Bestaetigen'] - Text for the confirm button.
	 * @param {string} [options.cancelText='Abbrechen'] - Text for the cancel button.
	 * @param {boolean} [options.danger=false] - If true, styles the confirm button as dangerous/red.
	 * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled.
	 */
	function confirmAction(options) {
		if (!options) options = {};

		// If GartenPlaner instance is available and has showConfirm, delegate to it
		// This ensures consistent behavior with existing code that uses the DOM modal
		if (window.gartenPlaner && typeof window.gartenPlaner.showConfirm === "function") {
			return window.gartenPlaner.showConfirm({
				title: options.title || "Best\u00e4tigung erforderlich",
				icon: options.icon || "\u26a0\ufe0f",
				message: options.message || "M\u00f6chten Sie fortfahren?",
				confirmText: options.confirmText || "Best\u00e4tigen",
				cancelText: options.cancelText || "Abbrechen",
				danger: !!options.danger,
			});
		}

		// Fallback: use the confirmModal DOM directly if it exists
		var modal = document.getElementById("confirmModal");
		if (modal) {
			return _showModalDialog(modal, options);
		}

		// Last resort: native confirm
		var result = confirm(
			(options.title ? options.title + "\n\n" : "") +
			(options.message || "M\u00f6chten Sie fortfahren?"),
		);
		return Promise.resolve(result);
	}

	/**
	 * Internal: drives the existing confirmModal DOM element.
	 */
	function _showModalDialog(modal, options) {
		return new Promise(function (resolve) {
			var title = document.getElementById("confirmModalTitle");
			var icon = document.getElementById("confirmModalIcon");
			var message = document.getElementById("confirmModalMessage");
			var okBtn = document.getElementById("confirmOkBtn");
			var cancelBtn = document.getElementById("confirmCancelBtn");

			var previouslyFocused = document.activeElement;

			if (title) title.textContent = options.title || "Best\u00e4tigung erforderlich";
			if (icon) icon.textContent = options.icon || "\u26a0\ufe0f";
			if (message) {
				message.innerHTML = (options.message || "M\u00f6chten Sie fortfahren?")
					.replace(/\n/g, "<br>");
			}
			if (okBtn) okBtn.textContent = options.confirmText || "Best\u00e4tigen";
			if (cancelBtn) cancelBtn.textContent = options.cancelText || "Abbrechen";

			// Hide cancel button if no cancel text
			if (cancelBtn) {
				cancelBtn.style.display = options.cancelText === "" ? "none" : "block";
			}

			// Danger styling
			if (okBtn) {
				if (options.danger) {
					okBtn.classList.add("btn-danger");
				} else {
					okBtn.classList.remove("btn-danger");
				}
			}

			modal.style.display = "flex";
			modal.setAttribute("aria-hidden", "false");

			function closeAndResolve(result) {
				modal.style.display = "none";
				modal.setAttribute("aria-hidden", "true");
				cleanup();
				if (previouslyFocused && previouslyFocused.focus) {
					previouslyFocused.focus();
				}
				resolve(result);
			}

			function handleOk() { closeAndResolve(true); }
			function handleCancel() { closeAndResolve(false); }

			function cleanup() {
				if (okBtn) okBtn.removeEventListener("click", handleOk);
				if (cancelBtn) cancelBtn.removeEventListener("click", handleCancel);
				modal.removeEventListener("click", handleBackdropClick);
				document.removeEventListener("keydown", handleKeyDown);
			}

			function handleBackdropClick(e) {
				if (e.target === modal) {
					handleCancel();
				}
			}

			function handleKeyDown(e) {
				if (e.key === "Escape") {
					e.preventDefault();
					handleCancel();
				}
			}

			if (okBtn) okBtn.addEventListener("click", handleOk);
			if (cancelBtn) cancelBtn.addEventListener("click", handleCancel);
			modal.addEventListener("click", handleBackdropClick);
			document.addEventListener("keydown", handleKeyDown);

			// Focus appropriate button
			setTimeout(function () {
				if (options.danger && cancelBtn) {
					cancelBtn.focus();
				} else if (okBtn) {
					okBtn.focus();
				}
			}, 100);
		});
	}

	// Export to global scope
	window.confirmAction = confirmAction;
	window.GP = window.GP || {};
	window.GP.confirmAction = confirmAction;
})();
