// Statistiken-Seite Initialisierung (#71)
document.addEventListener('DOMContentLoaded', () => {
    if (window.gartenPlaner) {
        console.log('📊 Statistiken-Seite geladen');

        // Initial laden
        window.gartenPlaner.updateStatistics();
        window.gartenPlaner.updateCharts();
        window.gartenPlaner.updateAdditionalStats();
    }
});
