/**
 * offline-ui.js — PWA Offline UI (Banner, Sync-Toasts, Install-Prompt)
 * Provides visual feedback for offline state, sync results, and app install.
 * Dependencies (optional): window.SyncManager, window.TaskState
 */
(function () {
    'use strict';

    // ── Offline Banner ──────────────────────────────────────────────

    var banner = null;

    function createBanner() {
        banner = document.createElement('div');
        banner.className = 'offline-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.style.display = 'none';

        // Insert after .nav-container or nav, fallback to body first child
        var nav = document.querySelector('.nav-container') || document.querySelector('nav');
        if (nav && nav.parentNode) {
            nav.parentNode.insertBefore(banner, nav.nextSibling);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }
    }

    function showBanner(text, className) {
        if (!banner) return;
        banner.className = 'offline-banner ' + className;
        banner.innerHTML = '<span>\uD83D\uDCE1</span> ' + text;
        banner.style.display = 'flex';
    }

    function hideBanner() {
        if (!banner) return;
        banner.style.display = 'none';
    }

    // ── Sync Conflict Toast ─────────────────────────────────────────

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showConflictToast(conflict) {
        var title = escapeHtml(conflict.taskTitle || 'Unbekannte Aufgabe');

        var toast = document.createElement('div');
        toast.className = 'offline-sync-toast';
        toast.setAttribute('role', 'alert');
        toast.innerHTML =
            '<div class="offline-sync-toast-content">' +
                '<strong>\u26A0\uFE0F Sync-Konflikt</strong>' +
                '<p>Die Aufgabe &bdquo;' + title + '&ldquo; wurde gleichzeitig bearbeitet. Die Server-Version wurde uebernommen.</p>' +
                '<button class="offline-sync-toast-close" aria-label="Schliessen">&times;</button>' +
            '</div>';

        document.body.appendChild(toast);

        var closeBtn = toast.querySelector('.offline-sync-toast-close');
        closeBtn.addEventListener('click', function () {
            dismissToast(toast);
        });

        // Auto-dismiss after 10 seconds
        setTimeout(function () {
            dismissToast(toast);
        }, 10000);
    }

    function dismissToast(toast) {
        if (!toast || !toast.parentNode) return;
        toast.classList.add('offline-sync-toast-fade');
        setTimeout(function () {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    // ── Online / Offline Listeners ──────────────────────────────────

    function onOffline() {
        showBanner(
            'Du bist offline \u2014 Aenderungen werden synchronisiert sobald du wieder online bist',
            'offline-banner-warning'
        );
    }

    function onOnline() {
        hideBanner();

        if (window.SyncManager) {
            window.SyncManager.sync().then(function (result) {
                if (result.synced > 0) {
                    showBanner(
                        result.synced + ' Aenderung' + (result.synced > 1 ? 'en' : '') + ' erfolgreich synchronisiert!',
                        'offline-banner-success'
                    );
                    setTimeout(hideBanner, 4000);

                    // Show conflict toasts
                    if (result.conflicts && result.conflicts.length > 0) {
                        result.conflicts.forEach(function (conflict) {
                            showConflictToast(conflict);
                        });
                    }

                    // Reload tasks
                    if (window.TaskState && typeof window.TaskState.loadTasks === 'function') {
                        window.TaskState.loadTasks();
                    }
                }
            });
        }
    }

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    // ── Install Prompt ──────────────────────────────────────────────

    var deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;

        if (localStorage.getItem('install-hint-dismissed')) return;

        var main = document.querySelector('main');
        if (!main) return;

        var hint = document.createElement('div');
        hint.className = 'install-hint';
        hint.innerHTML =
            '<span>\uD83D\uDCA1 Tipp: Du kannst den GardenPlanner als App installieren!</span>' +
            '<button class="install-hint-btn">Installieren</button>' +
            '<button class="install-hint-dismiss" aria-label="Schliessen">&times;</button>';

        main.insertBefore(hint, main.firstChild);

        hint.querySelector('.install-hint-btn').addEventListener('click', function () {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function () {
                    deferredPrompt = null;
                });
            }
            hint.parentNode.removeChild(hint);
        });

        hint.querySelector('.install-hint-dismiss').addEventListener('click', function () {
            localStorage.setItem('install-hint-dismissed', 'true');
            hint.parentNode.removeChild(hint);
        });
    });

    // ── Init ────────────────────────────────────────────────────────

    function init() {
        createBanner();

        // Check initial state
        if (!navigator.onLine) {
            onOffline();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ── Public API ──────────────────────────────────────────────────

    window.OfflineUI = {
        showBanner: showBanner,
        hideBanner: hideBanner,
        showConflictToast: showConflictToast
    };
})();
