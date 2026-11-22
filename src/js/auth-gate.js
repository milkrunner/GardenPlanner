// API-Key-Zugang der Oberfläche (#322) und sichtbare Verbindungszustände (#324).
// Klassisches Skript: lädt nach api.js und vor app.js, stellt window.GP.Auth bereit.
// Ohne konfigurierten API_KEY auf dem Server bleibt alles unsichtbar.
(() => {
	const GP = (window.GP = window.GP || {});
	let pendingInput = null; // laufende Eingabe (Promise), verhindert doppelte Dialoge
	let declined = false; // Nutzer hat in dieser Seitensitzung abgebrochen

	function el(tag, props = {}, children = []) {
		const node = document.createElement(tag);
		Object.entries(props).forEach(([key, value]) => {
			if (key === "text") node.textContent = value;
			else if (key === "className") node.className = value;
			else node.setAttribute(key, value);
		});
		node.append(...children);
		return node;
	}

	function buildDialog() {
		const message = el("p", { id: "apiKeyModalMessage" });
		const input = el("input", {
			id: "apiKeyInput",
			type: "password",
			autocomplete: "off",
			spellcheck: "false",
			"aria-describedby": "apiKeyError",
		});
		const error = el("p", {
			id: "apiKeyError",
			role: "alert",
			className: "api-key-error",
		});
		const later = el("button", {
			type: "button",
			className: "btn btn-secondary",
			text: "Später",
		});
		const save = el("button", {
			type: "submit",
			className: "btn btn-primary",
			text: "Speichern",
		});
		const form = el(
			"form",
			{ className: "confirm-modal-body", novalidate: "" },
			[
				message,
				el("div", { className: "form-group" }, [
					el("label", { for: "apiKeyInput", text: "API-Key" }),
					input,
				]),
				error,
				el("div", { className: "modal-actions" }, [later, save]),
			],
		);
		const modal = el(
			"div",
			{
				id: "apiKeyModal",
				className: "modal",
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": "apiKeyModalTitle",
				"aria-describedby": "apiKeyModalMessage",
				"aria-hidden": "true",
			},
			[
				el("div", { className: "modal-content confirm-modal-content" }, [
					el("div", { className: "modal-header confirm-modal-header" }, [
						el("h2", { id: "apiKeyModalTitle", text: "API-Key erforderlich" }),
					]),
					form,
				]),
			],
		);
		document.body.appendChild(modal);
		return { modal, form, input, error, message, later };
	}

	function trapFocus(modal, event) {
		const focusable = Array.from(
			modal.querySelectorAll("button:not([disabled]), input:not([disabled])"),
		).filter((node) => node.offsetParent !== null);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	// Fragt den Schlüssel in einem Dialog ab. Ergebnis: Schlüssel oder null bei "Später".
	function requestKey(note = "") {
		if (pendingInput) return pendingInput;
		pendingInput = new Promise((resolve) => {
			const dialog = buildDialog();
			const { modal, form, input, error, message, later } = dialog;
			const previouslyFocused = document.activeElement;
			message.textContent = note
				? `${note} Bitte den API-Key eingeben (siehe Server-Konfiguration).`
				: "Der Server verlangt einen API-Key. Bitte den API-Key eingeben (siehe Server-Konfiguration).";
			modal.style.display = "flex";
			modal.setAttribute("aria-hidden", "false");
			input.focus();

			const close = (value) => {
				modal.removeEventListener("keydown", onKeyDown);
				modal.remove();
				pendingInput = null;
				if (previouslyFocused?.focus) previouslyFocused.focus();
				resolve(value);
			};
			const onKeyDown = (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					declined = true;
					close(null);
				} else if (event.key === "Tab") {
					trapFocus(modal, event);
				}
			};
			form.addEventListener("submit", (event) => {
				event.preventDefault();
				const value = input.value.trim();
				if (!value) {
					error.textContent = "Bitte einen API-Key eingeben.";
					input.focus();
					return;
				}
				declined = false;
				close(value);
			});
			later.addEventListener("click", () => {
				declined = true;
				close(null);
			});
			modal.addEventListener("keydown", onKeyDown);
		});
		return pendingInput;
	}

	// Persistente Statusleiste am Seitenanfang. kind: "offline" | "error" | "auth".
	function setStatus(kind, text, action) {
		let bar = document.getElementById("gpStatusBar");
		if (!bar) {
			bar = el("div", { id: "gpStatusBar" });
			document.body.insertBefore(bar, document.body.firstChild);
		}
		bar.className = `gp-status-bar gp-status-bar--${kind}`;
		bar.setAttribute("role", kind === "offline" ? "status" : "alert");
		bar.replaceChildren(el("span", { text }));
		if (action) {
			const button = el("button", {
				type: "button",
				className: "btn btn-secondary",
				text: action.label,
			});
			button.addEventListener("click", action.run);
			bar.appendChild(button);
		}
	}

	function clearStatus() {
		document.getElementById("gpStatusBar")?.remove();
	}

	// Wird von TaskAPI bei 401 aufgerufen: true, wenn ein neuer Schlüssel gespeichert wurde.
	async function handleUnauthorized(keyWasSent) {
		if (declined) return false;
		const key = await requestKey(
			keyWasSent ? "Der gespeicherte API-Key wurde abgelehnt." : "",
		);
		if (!key) return false;
		window.TaskAPI.setApiKey(key);
		return true;
	}

	// Nachträgliche Eingabe über die Statusleiste; lädt die Seite mit dem neuen Schlüssel neu.
	async function enterKeyAndReload() {
		declined = false;
		const key = await requestKey();
		if (!key) return;
		window.TaskAPI.setApiKey(key);
		window.location.reload();
	}

	// Vor dem ersten Laden aufrufen. Ergebnis: { ok, offline?, denied? }.
	async function ensureAccess() {
		const api = window.TaskAPI;
		if (!api) return { ok: true };
		let required;
		try {
			required = await api.checkAuthRequired();
		} catch {
			return { ok: true, offline: true }; // Fehler behandelt das Laden selbst
		}
		if (!required) return { ok: true };

		let note = "";
		for (let attempt = 0; attempt < 3; attempt++) {
			const stored = api.getApiKey();
			if (stored) {
				const result = await api.verifyApiKey(stored);
				if (result === "ok") return { ok: true };
				if (result === "unreachable") return { ok: true, offline: true };
				api.setApiKey("");
				note = "Der gespeicherte API-Key wurde abgelehnt.";
			}
			const key = await requestKey(note);
			if (!key) break;
			api.setApiKey(key);
		}
		setStatus(
			"auth",
			"API-Key fehlt oder wurde abgelehnt – Aufgaben werden nicht vom Server geladen.",
			{ label: "API-Key eingeben", run: enterKeyAndReload },
		);
		return { ok: false, denied: true };
	}

	GP.Auth = {
		ensureAccess,
		handleUnauthorized,
		requestKey,
		setStatus,
		clearStatus,
		enterKeyAndReload,
	};
})();
