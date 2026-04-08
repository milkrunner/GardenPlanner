// Dashboard-spezifische Initialisierung (#71)
document.addEventListener('DOMContentLoaded', function () {
    if (window.gartenPlaner) {
        console.log('📊 Dashboard geladen');
    }

    // View Toggle: Liste / Kacheln (#238)
    var tasksList = document.getElementById('tasksList');
    var toggleBtns = document.querySelectorAll('.view-toggle-btn');

    if (!tasksList || toggleBtns.length === 0) {
        return;
    }

    // Restore saved view preference
    var savedView = localStorage.getItem('taskViewMode') || 'list';
    applyView(savedView);

    // Click handler for toggle buttons
    toggleBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var view = btn.getAttribute('data-view');
            applyView(view);
            localStorage.setItem('taskViewMode', view);
        });
    });

    function applyView(view) {
        // Update button states
        toggleBtns.forEach(function (btn) {
            if (btn.getAttribute('data-view') === view) {
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-pressed', 'false');
            }
        });

        // Toggle tile-view class on task list
        if (view === 'tiles') {
            tasksList.classList.add('tile-view');
        } else {
            tasksList.classList.remove('tile-view');
        }

        // Add status labels for tile view
        updateTileStatusLabels();
    }

    function updateTileStatusLabels() {
        var cards = tasksList.querySelectorAll('.task-card');
        cards.forEach(function (card) {
            var infoDiv = card.querySelector('.task-info');
            if (infoDiv) {
                if (card.classList.contains('completed')) {
                    infoDiv.setAttribute('data-status-label', 'Erledigt');
                } else {
                    infoDiv.setAttribute('data-status-label', 'Offen');
                }
            }
        });
    }

    // Re-apply status labels when tasks are re-rendered
    var observer = new MutationObserver(function () {
        if (tasksList.classList.contains('tile-view')) {
            updateTileStatusLabels();
        }
    });
    observer.observe(tasksList, { childList: true, subtree: true });
});
