// Sync-Manager for Gartenplaner PWA (#46)
// Handles syncing offline changes back to the server when connectivity returns.
// Dependencies: window.OfflineStore, window.TaskAPI

var SyncManager = (function () {
    'use strict';

    var _syncing = false;

    /**
     * Processes a single 'create' sync entry.
     * POSTs to TaskAPI, replaces local temp ID with server ID in IndexedDB.
     * @param {Object} entry - Sync queue entry with { taskId, data }
     * @returns {Promise<{ conflict: null }>}
     */
    function _processCreate(entry) {
        return window.TaskAPI.createTask(entry.data).then(function (serverTask) {
            // Remove the temp-ID task from IndexedDB
            return window.OfflineStore.deleteTask(entry.taskId).then(function () {
                // Store the server-assigned task
                return window.OfflineStore.putTask(serverTask);
            });
        }).then(function () {
            return { conflict: null };
        });
    }

    /**
     * Processes a single 'update' sync entry.
     * Uses raw fetch to PUT so we can handle 409 conflicts specially.
     * @param {Object} entry - Sync queue entry with { taskId, data, timestamp }
     * @returns {Promise<{ conflict: Object|null }>}
     */
    function _processUpdate(entry) {
        var url = window.TaskAPI.baseUrl + '/tasks/' + encodeURIComponent(entry.taskId);
        var body = Object.assign({}, entry.data, { lastKnownUpdate: entry.timestamp });

        return fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body)
        }).then(function (response) {
            if (response.status === 409) {
                // Conflict — server has a newer version
                return response.json().then(function (serverTask) {
                    // Put the server version into IndexedDB
                    return window.OfflineStore.putTask(serverTask).then(function () {
                        return {
                            conflict: {
                                conflict: true,
                                taskId: entry.taskId,
                                taskTitle: entry.data.title || '',
                                localChanges: entry.data,
                                serverTask: serverTask
                            }
                        };
                    });
                });
            }

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            return response.json().then(function (serverTask) {
                return window.OfflineStore.putTask(serverTask).then(function () {
                    return { conflict: null };
                });
            });
        });
    }

    /**
     * Processes a single 'delete' sync entry.
     * DELETEs via TaskAPI. Treats 404 as success (already deleted).
     * @param {Object} entry - Sync queue entry with { taskId }
     * @returns {Promise<{ conflict: null }>}
     */
    function _processDelete(entry) {
        return window.TaskAPI.deleteTask(entry.taskId).then(function () {
            return { conflict: null };
        }).catch(function (err) {
            // Treat 404 as success — task was already deleted on server
            if (err && err.message && err.message.indexOf('404') !== -1) {
                return { conflict: null };
            }
            throw err;
        });
    }

    /**
     * Processes a single sync queue entry based on its type.
     * @param {Object} entry - { type: 'create'|'update'|'delete', taskId, data, timestamp }
     * @returns {Promise<{ conflict: Object|null }>}
     */
    function _processEntry(entry) {
        switch (entry.type) {
            case 'create':
                return _processCreate(entry);
            case 'update':
                return _processUpdate(entry);
            case 'delete':
                return _processDelete(entry);
            default:
                return Promise.reject(new Error('Unknown sync entry type: ' + entry.type));
        }
    }

    /**
     * Syncs all pending offline changes to the server.
     * Processes entries sequentially (FIFO). Stops on network failure.
     * @returns {Promise<{ synced: number, conflicts: Array }>}
     */
    function sync() {
        // If already syncing or offline, resolve immediately
        if (_syncing || !navigator.onLine) {
            return Promise.resolve({ synced: 0, conflicts: [] });
        }

        _syncing = true;

        return window.OfflineStore.getSyncQueue().then(function (entries) {
            if (entries.length === 0) {
                _syncing = false;
                return { synced: 0, conflicts: [] };
            }

            var synced = 0;
            var conflicts = [];

            // Process entries sequentially using reduce
            var chain = entries.reduce(function (promise, entry) {
                return promise.then(function (shouldContinue) {
                    if (!shouldContinue) {
                        return false;
                    }

                    return _processEntry(entry).then(function (result) {
                        synced++;

                        if (result.conflict) {
                            conflicts.push(result.conflict);
                        }

                        // Remove processed entry from sync queue
                        return window.OfflineStore.removeSyncEntry(entry.id).then(function () {
                            return true; // continue processing
                        });
                    }).catch(function () {
                        // Network failure mid-sync — stop processing
                        return false;
                    });
                });
            }, Promise.resolve(true));

            return chain.then(function () {
                _syncing = false;
                return { synced: synced, conflicts: conflicts };
            });
        }).catch(function (err) {
            _syncing = false;
            throw err;
        });
    }

    /**
     * Registers a Background Sync tag with the service worker.
     * Silently warns if Background Sync is not available.
     */
    function registerBackgroundSync() {
        if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
            console.warn('[SyncManager] Background Sync nicht verfügbar');
            return;
        }

        navigator.serviceWorker.ready.then(function (reg) {
            return reg.sync.register('gardenplanner-sync');
        }).catch(function (err) {
            console.warn('[SyncManager] Background Sync Registration fehlgeschlagen:', err);
        });
    }

    /**
     * Sets up listener for service worker messages.
     * When the SW sends { type: 'SYNC_REQUESTED' }, triggers a sync.
     */
    function _initServiceWorkerListener() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', function (event) {
                if (event.data && event.data.type === 'SYNC_REQUESTED') {
                    sync();
                }
            });
        }
    }

    // Initialize SW message listener on load
    _initServiceWorkerListener();

    return {
        sync: sync,
        registerBackgroundSync: registerBackgroundSync
    };
})();

window.SyncManager = SyncManager;
window.GP = window.GP || {};
window.GP.SyncManager = SyncManager;
