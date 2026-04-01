// Plant Library Module
(function () {
    const API_BASE = '/api';
    let allPlants = [];
    let currentCategory = '';
    let currentSort = 'name-asc';
    let showFavoritesOnly = false;

    // Favorites stored in localStorage
    function getFavorites() {
        try {
            const stored = localStorage.getItem('plant_favorites');
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    function saveFavorites(favorites) {
        localStorage.setItem('plant_favorites', JSON.stringify(favorites));
    }

    function toggleFavorite(plantId) {
        const favorites = getFavorites();
        const index = favorites.indexOf(plantId);
        if (index === -1) {
            favorites.push(plantId);
        } else {
            favorites.splice(index, 1);
        }
        saveFavorites(favorites);
        return index === -1; // returns true if now favorited
    }

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
            applyClientFiltersAndRender();
        } catch (err) {
            console.error('Fehler beim Laden der Pflanzen:', err);
            const grid = document.getElementById('plantGrid');
            if (grid) {
                grid.innerHTML = typeof UIStates !== "undefined"
                    ? UIStates.renderErrorState("Pflanzen konnten nicht geladen werden.", function () { loadPlants(); })
                    : '<div class="empty-state"><h3>Fehler beim Laden</h3></div>';
            }
            updateResultCount(0);
        }
    }

    function sortPlants(plants) {
        const sorted = [...plants];
        switch (currentSort) {
            case 'name-asc':
                sorted.sort((a, b) => a.name.localeCompare(b.name, 'de'));
                break;
            case 'name-desc':
                sorted.sort((a, b) => b.name.localeCompare(a.name, 'de'));
                break;
            case 'category':
                sorted.sort((a, b) => {
                    const catCmp = a.category.localeCompare(b.category, 'de');
                    return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name, 'de');
                });
                break;
        }
        return sorted;
    }

    function applyClientFiltersAndRender() {
        let plants = [...allPlants];

        // Filter favorites if toggle is active
        if (showFavoritesOnly) {
            const favorites = getFavorites();
            plants = plants.filter(p => favorites.includes(p.id));
        }

        // Sort
        plants = sortPlants(plants);

        updateResultCount(plants.length);
        renderPlants(plants);
    }

    function updateResultCount(count) {
        const el = document.getElementById('plantResultCount');
        if (!el) return;
        if (count === 1) {
            el.textContent = '1 Pflanze gefunden';
        } else {
            el.textContent = `${count} Pflanzen gefunden`;
        }
    }

    function renderPlants(plants) {
        const grid = document.getElementById('plantGrid');
        if (!grid) return;

        if (plants.length === 0) {
            var searchInput = document.getElementById('plantSearch');
            var searchVal = searchInput ? searchInput.value.trim() : '';
            if (typeof UIStates !== "undefined" && searchVal) {
                grid.innerHTML = UIStates.renderNoResultsState(searchVal);
            } else if (typeof UIStates !== "undefined") {
                grid.innerHTML = UIStates.renderEmptyState('\ud83c\udf31', 'Keine Pflanzen gefunden', 'Versuchen Sie einen anderen Suchbegriff oder passen Sie die Filter an.');
            } else {
                grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\ud83c\udf31</div><h3>Keine Pflanzen gefunden</h3><p>Versuchen Sie einen anderen Suchbegriff oder passen Sie die Filter an.</p></div>';
            }
            return;
        }

        const favorites = getFavorites();

        grid.innerHTML = plants.map(p => {
            var safeName = Security.escapeHtml(p.name);
            var safeCategory = Security.escapeHtml(p.category);
            var diffLabel = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwer' }[p.difficulty] || p.difficulty;
            var sunLabel = { full: 'Volle Sonne', partial: 'Halbschatten', shade: 'Schatten' }[p.sun] || p.sun;
            var waterLabel = { low: 'Wenig', medium: 'Mittel', high: 'Viel' }[p.water] || p.water;
            var isFav = favorites.includes(p.id);

            return `
                <div class="plant-card" data-plant-id="${p.id}">
                    <button class="plant-favorite-btn${isFav ? ' active' : ''}" data-plant-id="${p.id}" aria-label="${isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}" aria-pressed="${isFav}" title="${isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                    </button>
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

        // Attach click handlers for plant detail (not on favorite button)
        grid.querySelectorAll('.plant-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't open detail when clicking favorite button
                if (e.target.closest('.plant-favorite-btn')) return;
                openPlantDetail(card.dataset.plantId);
            });
        });

        // Attach click handlers for favorite buttons
        grid.querySelectorAll('.plant-favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const plantId = btn.dataset.plantId;
                const nowFav = toggleFavorite(plantId);
                btn.classList.toggle('active', nowFav);
                btn.setAttribute('aria-pressed', String(nowFav));
                btn.setAttribute('aria-label', nowFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen');
                btn.setAttribute('title', nowFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen');
                const svg = btn.querySelector('svg');
                if (svg) svg.setAttribute('fill', nowFav ? 'currentColor' : 'none');

                // If showing favorites only and we just unfavorited, re-render
                if (showFavoritesOnly && !nowFav) {
                    applyClientFiltersAndRender();
                }
            });
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

        modal.classList.add('active');

        content.querySelector('.plant-modal-close').addEventListener('click', () => { modal.classList.remove('active'); });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

        const createBtn = content.querySelector('.plant-create-task-btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                window.location.href = `/index?title=${encodeURIComponent(plant.name + ' pflegen')}&location=${encodeURIComponent('Garten')}`;
            });
        }
    }

    function setupEventListeners() {
        // Search input with debounce
        const searchInput = document.getElementById('plantSearch');
        if (searchInput) {
            let timeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => loadPlants(searchInput.value.trim()), 300);
            });
        }

        // Category filter buttons
        document.getElementById('categoryFilters')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (!btn) return;
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            const searchInput = document.getElementById('plantSearch');
            loadPlants(searchInput?.value?.trim() || '');
        });

        // Sort dropdown
        const sortSelect = document.getElementById('plantSort');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                currentSort = sortSelect.value;
                applyClientFiltersAndRender();
            });
        }

        // Favorites toggle
        const favToggle = document.getElementById('favoritesToggle');
        if (favToggle) {
            favToggle.addEventListener('click', () => {
                showFavoritesOnly = !showFavoritesOnly;
                favToggle.classList.toggle('active', showFavoritesOnly);
                favToggle.setAttribute('aria-pressed', String(showFavoritesOnly));
                applyClientFiltersAndRender();
            });
        }

        // Escape to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('plantModal');
                if (modal) modal.classList.remove('active');
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
