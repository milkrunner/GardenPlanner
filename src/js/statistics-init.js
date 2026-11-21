// Statistiken-Seite Initialisierung (#71)
document.addEventListener("DOMContentLoaded", async () => {
	if (window.gartenPlaner) {
		await window.gartenPlaner.whenReady();
		window.GP?.debug?.("📊 Statistiken-Seite geladen");

		window.gartenPlaner.updateStatistics();
		window.gartenPlaner.updateCharts();
		window.gartenPlaner.updateAdditionalStats();
	}
});
