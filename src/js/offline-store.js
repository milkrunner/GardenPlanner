// IndexedDB Offline-Store for Gartenplaner PWA (#46)
// Provides CRUD operations for tasks and a sync queue for offline changes.

var OfflineStore = (function () {
    'use strict';

    var DB_NAME = 'gardenplanner-offline';
    var DB_VERSION = 1;
    var TASKS_STORE = 'tasks';
    var SYNC_STORE = 'sync-queue';

    var _db = null;

    /**
     * Opens the IndexedDB database. Creates object stores on upgrade.
     * Caches the db reference so subsequent calls reuse it.
     * @returns {Promise<IDBDatabase>}
     */
    function open() {
        if (_db) {
            return Promise.resolve(_db);
        }

        return new Promise(function (resolve, reject) {
            var request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = function (event) {
                var db = event.target.result;

                if (!db.objectStoreNames.contains(TASKS_STORE)) {
                    db.createObjectStore(TASKS_STORE, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(SYNC_STORE)) {
                    var syncStore = db.createObjectStore(SYNC_STORE, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    syncStore.createIndex('taskId', 'taskId', { unique: false });
                }
            };

            request.onsuccess = function (event) {
                _db = event.target.result;
                resolve(_db);
            };

            request.onerror = function (event) {
                reject(event.target.error);
            };
        });
    }

    /**
     * Opens a transaction and returns the object store.
     * @param {string} storeName - Name of the object store
     * @param {string} mode - Transaction mode ('readonly' or 'readwrite')
     * @returns {Promise<IDBObjectStore>}
     */
    function transaction(storeName, mode) {
        return open().then(function (db) {
            var tx = db.transaction(storeName, mode);
            return tx.objectStore(storeName);
        });
    }

    /**
     * Wraps an IDBRequest in a Promise.
     * @param {IDBRequest} request
     * @returns {Promise}
     */
    function promisify(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () {
                resolve(request.result);
            };
            request.onerror = function () {
                reject(request.error);
            };
        });
    }

    /**
     * Returns all tasks from the tasks store.
     * @returns {Promise<Array>}
     */
    function getAllTasks() {
        return transaction(TASKS_STORE, 'readonly').then(function (store) {
            return promisify(store.getAll());
        });
    }

    /**
     * Returns a single task by id, or null if not found.
     * @param {string|number} id
     * @returns {Promise<Object|null>}
     */
    function getTask(id) {
        return transaction(TASKS_STORE, 'readonly').then(function (store) {
            return promisify(store.get(id));
        }).then(function (result) {
            return result !== undefined ? result : null;
        });
    }

    /**
     * Puts (upserts) a single task into the tasks store.
     * @param {Object} task - Must have an `id` property
     * @returns {Promise}
     */
    function putTask(task) {
        return transaction(TASKS_STORE, 'readwrite').then(function (store) {
            return promisify(store.put(task));
        });
    }

    /**
     * Clears the tasks store and then puts all provided tasks.
     * @param {Array} tasks
     * @returns {Promise}
     */
    function putAllTasks(tasks) {
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(TASKS_STORE, 'readwrite');
                var store = tx.objectStore(TASKS_STORE);

                store.clear();

                for (var i = 0; i < tasks.length; i++) {
                    store.put(tasks[i]);
                }

                tx.oncomplete = function () {
                    resolve();
                };

                tx.onerror = function () {
                    reject(tx.error);
                };
            });
        });
    }

    /**
     * Deletes a task by id.
     * @param {string|number} id
     * @returns {Promise}
     */
    function deleteTask(id) {
        return transaction(TASKS_STORE, 'readwrite').then(function (store) {
            return promisify(store.delete(id));
        });
    }

    /**
     * Adds an entry to the sync queue and returns the generated id.
     * @param {Object} entry - { type: 'create'|'update'|'delete', taskId, data, timestamp }
     * @returns {Promise<number>} The auto-generated id
     */
    function addToSyncQueue(entry) {
        return transaction(SYNC_STORE, 'readwrite').then(function (store) {
            return promisify(store.add(entry));
        });
    }

    /**
     * Returns all entries from the sync queue.
     * @returns {Promise<Array>}
     */
    function getSyncQueue() {
        return transaction(SYNC_STORE, 'readonly').then(function (store) {
            return promisify(store.getAll());
        });
    }

    /**
     * Removes a single entry from the sync queue by id.
     * @param {number} id
     * @returns {Promise}
     */
    function removeSyncEntry(id) {
        return transaction(SYNC_STORE, 'readwrite').then(function (store) {
            return promisify(store.delete(id));
        });
    }

    /**
     * Clears the entire sync queue.
     * @returns {Promise}
     */
    function clearSyncQueue() {
        return transaction(SYNC_STORE, 'readwrite').then(function (store) {
            return promisify(store.clear());
        });
    }

    /**
     * Returns the number of entries in the sync queue.
     * @returns {Promise<number>}
     */
    function getSyncQueueCount() {
        return transaction(SYNC_STORE, 'readonly').then(function (store) {
            return promisify(store.count());
        });
    }

    return {
        open: open,
        getAllTasks: getAllTasks,
        getTask: getTask,
        putTask: putTask,
        putAllTasks: putAllTasks,
        deleteTask: deleteTask,
        addToSyncQueue: addToSyncQueue,
        getSyncQueue: getSyncQueue,
        removeSyncEntry: removeSyncEntry,
        clearSyncQueue: clearSyncQueue,
        getSyncQueueCount: getSyncQueueCount
    };
})();

window.OfflineStore = OfflineStore;
window.GP = window.GP || {};
window.GP.OfflineStore = OfflineStore;
