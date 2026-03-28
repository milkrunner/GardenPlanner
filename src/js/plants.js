// Plant Library Module
(function () {
    const API_BASE = '/api';
    let allPlants = [];
    let currentCategory = '';

    async function init() {
        await loadCategories();
        await loadPlants();
        setupEventListeners();
    }

    async function loadCategories() {
        try {
            const res = await fetch(`${API_BASE}/plant-categories`);
            const categories = await res.json();
            const container = document.getElementById('categoryFilters');
            if (!container) return;

            container.innerHTML = '<button class="category-btn active" data-category="">Alle</button>' +
                categories.map(c => `<button class="category-btn" data-category="${Security.escapeHtml(c)}">${Security.escapeHtml(c)}</button>`).join('');
        } catch (err) {
            console.error('Fehler beim Laden der Kategorien:', err);
        }
    }

    async function loadPlants(search) {
        try {
            const params = new URLSearchParams();
            if (currentCategory) params.set('category', currentCategory);
            if (search) params.set('search', search);
            const qs = params.toString();

            const res = await fetch(`${API_BASE}/plants${qs ? '?' + qs : ''}`);
            allPlants = await res.json();
            renderPlants(allPlants);
        } catch (err) {
            console.error('Fehler beim Laden der Pflanzen:', err);
            const grid = document.getElementById('plantGrid');
            if (grid) grid.innerHTML = '<div class="empty-state"><h3>Fehler beim Laden</h3></div>';
        }
    }

    function renderPlants(plants) {
        const grid = document.getElementById('plantGrid');
        if (!grid) return;

        if (plants.length === 0) {
            grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🌱</div><h3>Keine Pflanzen gefunden</h3><p>Versuchen Sie einen anderen Suchbegriff.</p></div>';
            return;
        }

        grid.innerHTML = plants.map(p => {
            var safeName = Security.escapeHtml(p.name);
            var safeCategory = Security.escapeHtml(p.category);
            var diffLabel = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwer' }[p.difficulty] || p.difficulty;
            var sunLabel = { full: 'Volle Sonne', partial: 'Halbschatten', shade: 'Schatten' }[p.sun] || p.sun;
            var waterLabel = { low: 'Wenig', medium: 'Mittel', high: 'Viel' }[p.water] || p.water;

            return `
                <div class="plant-card" data-plant-id="${p.id}">
                    <div class="plant-card-icon">${p.icon}</div>
                    <div class="plant-card-body">
                        <h3 class="plant-card-name">${safeName}</h3>
                        <span class="plant-card-category">${safeCategory}</span>
                        <div class="plant-card-tags">
                            <span class="plant-tag difficulty-${p.difficulty}">${diffLabel}</span>
                            <span class="plant-tag">${sunLabel}</span>
                            <span class="plant-tag">${waterLabel} Wasser</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.plant-card').forEach(card => {
            card.addEventListener('click', () => openPlantDetail(card.dataset.plantId));
        });
    }

    function openPlantDetail(plantId) {
        const plant = allPlants.find(p => p.id === plantId);
        if (!plant) return;

        const modal = document.getElementById('plantModal');
        const content = document.getElementById('plantModalContent');
        if (!modal || !content) return;

        var safeName = Security.escapeHtml(plant.name);
        var safeTips = Security.escapeHtml(plant.tips);
        var safeCategory = Security.escapeHtml(plant.category);
        var diffLabel = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwer' }[plant.difficulty] || plant.difficulty;
        var sunLabel = { full: 'Volle Sonne', partial: 'Halbschatten', shade: 'Schatten' }[plant.sun] || plant.sun;
        var waterLabel = { low: 'Wenig', medium: 'Mittel', high: 'Viel' }[plant.water] || plant.water;
        var seasons = (plant.season || []).map(s => ({
            spring: 'Frühling', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter'
        }[s] || s)).join(', ');

        content.innerHTML = `
            <button class="plant-modal-close" aria-label="Schließen">&times;</button>
            <div class="plant-detail-header">
                <span class="plant-detail-icon">${plant.icon}</span>
                <div>
                    <h2>${safeName}</h2>
                    <span class="plant-card-category">${safeCategory}</span>
                </div>
            </div>
            <div class="plant-detail-grid">
                <div class="plant-detail-item"><strong>Schwierigkeit</strong><span class="plant-tag difficulty-${plant.difficulty}">${diffLabel}</span></div>
                <div class="plant-detail-item"><strong>Sonne</strong><span>${sunLabel}</span></div>
                <div class="plant-detail-item"><strong>Wasser</strong><span>${waterLabel}</span></div>
                <div class="plant-detail-item"><strong>Abstand</strong><span>${Security.escapeHtml(plant.spacing)}</span></div>
                <div class="plant-detail-item"><strong>Keimung</strong><span>${Security.escapeHtml(plant.germination)}</span></div>
                <div class="plant-detail-item"><strong>Ernte</strong><span>${Security.escapeHtml(plant.harvest)}</span></div>
                <div class="plant-detail-item"><strong>Saison</strong><span>${seasons}</span></div>
            </div>
            <div class="plant-detail-section">
                <h3>Pflegetipps</h3>
                <p>${safeTips}</p>
            </div>
            ${plant.companions.length > 0 ? `<div class="plant-detail-section"><h3>Gute Nachbarn</h3><div class="companion-tags">${plant.companions.map(c => `<span class="companion-tag good">${Security.escapeHtml(c)}</span>`).join('')}</div></div>` : ''}
            ${plant.avoid.length > 0 ? `<div class="plant-detail-section"><h3>Schlechte Nachbarn</h3><div class="companion-tags">${plant.avoid.map(c => `<span class="companion-tag bad">${Security.escapeHtml(c)}</span>`).join('')}</div></div>` : ''}
            <div class="plant-detail-actions">
                <button class="btn btn-primary plant-create-task-btn" data-plant="${safeName}">Aufgabe erstellen</button>
            </div>
        `;

        modal.style.display = 'flex';

        content.querySelector('.plant-modal-close').addEventListener('click', () => { modal.style.display = 'none'; });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

        const createBtn = content.querySelector('.plant-create-task-btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                window.location.href = `/index?title=${encodeURIComponent(plant.name + ' pflegen')}&location=${encodeURIComponent('Garten')}`;
            });
        }
    }

    function setupEventListeners() {
        const searchInput = document.getElementById('plantSearch');
        if (searchInput) {
            let timeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => loadPlants(searchInput.value.trim()), 300);
            });
        }

        document.getElementById('categoryFilters')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (!btn) return;
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            const searchInput = document.getElementById('plantSearch');
            loadPlants(searchInput?.value?.trim() || '');
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('plantModal');
                if (modal) modal.style.display = 'none';
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
