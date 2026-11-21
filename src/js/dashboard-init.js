// Dashboard-spezifische Initialisierung (#71)
document.addEventListener("DOMContentLoaded", () => {
	if (window.gartenPlaner) {
		window.GP?.debug?.("📊 Dashboard geladen");
	}
});
