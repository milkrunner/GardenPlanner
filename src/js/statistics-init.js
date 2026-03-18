// Statistiken-Seite Initialisierung (#71)
document.addEventListener('DOMContentLoaded', async () => {
    if (window.gartenPlaner) {
        await window.gartenPlaner.whenReady();
        console.log('📊 Statistiken-Seite geladen');

        window.gartenPlaner.updateStatistics();
        window.gartenPlaner.updateCharts();
        window.gartenPlaner.updateAdditionalStats();
    }
});
