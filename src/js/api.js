// API Client for Gartenplaner REST API
const TaskAPI = {
    baseUrl: "/api/v1",

    async checkAuth() {
        const res = await fetch(`${this.baseUrl}/auth/status`, { credentials: 'same-origin' });
        return res.json();
    },

    async login(username, password) {
        const res = await fetch(`${this.baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message || 'Login failed');
        }
        return res.json();
    },

    async logout() {
        await fetch(`${this.baseUrl}/auth/logout`, {
            method: 'POST',
            credentials: 'same-origin'
        });
        window.location.href = '/login';
    },

    async _fetch(url, options = {}) {
        const res = await fetch(this.baseUrl + url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            credentials: 'same-origin',
            ...options,
        });
        if (res.status === 401) {
            window.location.href = '/login';
            throw new Error('Authentication required');
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const msg = body.errors ? body.errors.join(', ') : body.message || `HTTP ${res.status}`;
            throw new Error(msg);
        }
        if (res.status === 204) return null;
        return res.json();
    },

    async getTasks(filters = {}) {
        const params = new URLSearchParams();
        if (filters.status) params.set("status", filters.status);
        if (filters.employee) params.set("employee", filters.employee);
        if (filters.location) params.set("location", filters.location);
        const qs = params.toString();
        try {
            const result = await this._fetch(`/tasks${qs ? `?${qs}` : ""}`);
            // Mirror to IndexedDB (fire-and-forget)
            if (window.OfflineStore) {
                const tasks = Array.isArray(result) ? result : (result && result.data ? result.data : []);
                window.OfflineStore.putAllTasks(tasks).catch(() => {});
            }
            return result;
        } catch (err) {
            if (!navigator.onLine && window.OfflineStore) {
                const cached = await window.OfflineStore.getAllTasks();
                // Apply filters client-side
                return cached.filter(task => {
                    if (filters.status && task.status !== filters.status) return false;
                    if (filters.employee && task.employee !== filters.employee) return false;
                    if (filters.location && task.location !== filters.location) return false;
                    return true;
                });
            }
            throw err;
        }
    },

    async getTask(id) {
        try {
            const task = await this._fetch(`/tasks/${encodeURIComponent(id)}`);
            // Mirror to IndexedDB (fire-and-forget)
            if (window.OfflineStore) {
                window.OfflineStore.putTask(task).catch(() => {});
            }
            return task;
        } catch (err) {
            if (!navigator.onLine && window.OfflineStore) {
                return window.OfflineStore.getTask(id);
            }
            throw err;
        }
    },

    async createTask(taskData) {
        try {
            const task = await this._fetch("/tasks", { method: "POST", body: JSON.stringify(taskData) });
            // Mirror to IndexedDB (fire-and-forget)
            if (window.OfflineStore) {
                window.OfflineStore.putTask(task).catch(() => {});
            }
            return task;
        } catch (err) {
            if (!navigator.onLine && window.OfflineStore) {
                const now = new Date().toISOString();
                const offlineTask = {
                    ...taskData,
                    id: 'offline-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    status: taskData.status || 'pending',
                    priority: taskData.priority || 'medium',
                    recurrence: taskData.recurrence || 'none',
                    createdAt: now,
                    updatedAt: now,
                    _pendingSync: true,
                };
                await window.OfflineStore.putTask(offlineTask);
                await window.OfflineStore.addToSyncQueue({
                    type: 'create',
                    taskId: offlineTask.id,
                    data: taskData,
                    timestamp: now,
                });
                if (window.SyncManager) {
                    window.SyncManager.registerBackgroundSync();
                }
                return offlineTask;
            }
            throw err;
        }
    },

    async updateTask(id, taskData) {
        try {
            const task = await this._fetch(`/tasks/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(taskData) });
            // Mirror to IndexedDB (fire-and-forget)
            if (window.OfflineStore) {
                window.OfflineStore.putTask(task).catch(() => {});
            }
            return task;
        } catch (err) {
            if (!navigator.onLine && window.OfflineStore) {
                const now = new Date().toISOString();
                const existing = await window.OfflineStore.getTask(id) || {};
                const merged = {
                    ...existing,
                    ...taskData,
                    id: id,
                    updatedAt: now,
                    _pendingSync: true,
                };
                await window.OfflineStore.putTask(merged);
                await window.OfflineStore.addToSyncQueue({
                    type: 'update',
                    taskId: id,
                    data: taskData,
                    timestamp: existing.updatedAt || now,
                });
                if (window.SyncManager) {
                    window.SyncManager.registerBackgroundSync();
                }
                return merged;
            }
            throw err;
        }
    },

    async deleteTask(id) {
        try {
            const result = await this._fetch(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
            // Remove from IndexedDB (fire-and-forget)
            if (window.OfflineStore) {
                window.OfflineStore.deleteTask(id).catch(() => {});
            }
            return result;
        } catch (err) {
            if (!navigator.onLine && window.OfflineStore) {
                const now = new Date().toISOString();
                await window.OfflineStore.deleteTask(id);
                await window.OfflineStore.addToSyncQueue({
                    type: 'delete',
                    taskId: id,
                    data: null,
                    timestamp: now,
                });
                if (window.SyncManager) {
                    window.SyncManager.registerBackgroundSync();
                }
                return null;
            }
            throw err;
        }
    },

    /**
     * Upload photos for a task via multipart/form-data.
     * @param {string} taskId - Task UUID
     * @param {File[]} files - Array of File objects
     * @returns {Promise<{photos: string[], uploaded: string[]}>}
     */
    async uploadPhotos(taskId, files) {
        const formData = new FormData();
        files.forEach(file => formData.append('photos', file));

        const res = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}/photos`, {
            method: 'POST',
            credentials: 'same-origin',
            body: formData,
            // Note: Do NOT set Content-Type header - browser sets it with boundary
        });
        if (res.status === 401) {
            window.location.href = '/login';
            throw new Error('Authentication required');
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message || `HTTP ${res.status}`);
        }
        return res.json();
    },

    /**
     * Delete a photo from a task.
     * @param {string} taskId - Task UUID
     * @param {string} filename - Photo filename
     * @returns {Promise<{photos: string[]}>}
     */
    async deletePhoto(taskId, filename) {
        return this._fetch(`/tasks/${encodeURIComponent(taskId)}/photos/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
        });
    },

    /**
     * Get the URL for a photo thumbnail.
     * @param {string} filename - Photo filename
     * @returns {string} Thumbnail URL
     */
    getPhotoThumbUrl(filename) {
        return `${this.baseUrl}/photos/${encodeURIComponent(filename)}/thumb`;
    },

    /**
     * Get the URL for a full-size photo.
     * @param {string} filename - Photo filename
     * @returns {string} Full-size photo URL
     */
    getPhotoUrl(filename) {
        return `${this.baseUrl}/photos/${encodeURIComponent(filename)}`;
    },

    async archiveTask(id) {
        return this._fetch(`/tasks/${encodeURIComponent(id)}/archive`, { method: "POST" });
    },

    async unarchiveTask(id) {
        return this._fetch(`/tasks/${encodeURIComponent(id)}/unarchive`, { method: "POST" });
    },

    async getArchivedTasks() {
        return this._fetch("/archived-tasks");
    },

    async deleteArchivedTask(id) {
        return this._fetch(`/archived-tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    /**
     * Batch-Update fuer mehrere Aufgaben (#244).
     * @param {string[]} ids - Array von Task-UUIDs
     * @param {string} action - 'status' | 'priority' | 'archive'
     * @param {string} [value] - Neuer Wert
     * @returns {Promise<{updated: number, message: string}>}
     */
    async batchUpdate(ids, action, value) {
        return this._fetch('/tasks/batch', {
            method: 'PATCH',
            body: JSON.stringify({ ids, action, value })
        });
    },

    /**
     * Batch-Loeschung fuer mehrere Aufgaben (#244).
     * @param {string[]} ids - Array von Task-UUIDs
     * @returns {Promise<{deleted: number, message: string}>}
     */
    async batchDelete(ids) {
        return this._fetch('/tasks/batch', {
            method: 'DELETE',
            body: JSON.stringify({ ids })
        });
    },
};

window.TaskAPI = TaskAPI;
if (window.GP) window.GP.TaskAPI = TaskAPI;
