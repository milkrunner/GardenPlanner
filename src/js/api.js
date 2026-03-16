// API Client for Gartenplaner REST API
const TaskAPI = {
    baseUrl: '/api',

    getApiKey() {
        try {
            return localStorage.getItem('gardenplanner_api_key') || '';
        } catch {
            return '';
        }
    },

    setApiKey(key) {
        try {
            if (key) {
                localStorage.setItem('gardenplanner_api_key', key);
            } else {
                localStorage.removeItem('gardenplanner_api_key');
            }
        } catch {
            // localStorage unavailable
        }
    },

    async checkAuthRequired() {
        const res = await fetch(this.baseUrl + '/auth/status');
        const data = await res.json();
        return data.authRequired;
    },

    async _fetch(url, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        const apiKey = this.getApiKey();
        if (apiKey) {
            headers['X-API-Key'] = apiKey;
        }
        const res = await fetch(this.baseUrl + url, {
            headers,
            ...options
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const msg = body.errors ? body.errors.join(', ') : body.error || `HTTP ${res.status}`;
            throw new Error(msg);
        }
        if (res.status === 204) return null;
        return res.json();
    },

    async getTasks(filters = {}) {
        const params = new URLSearchParams();
        if (filters.status) params.set('status', filters.status);
        if (filters.employee) params.set('employee', filters.employee);
        if (filters.location) params.set('location', filters.location);
        const qs = params.toString();
        return this._fetch('/tasks' + (qs ? '?' + qs : ''));
    },

    async getTask(id) {
        return this._fetch('/tasks/' + encodeURIComponent(id));
    },

    async createTask(taskData) {
        return this._fetch('/tasks', {
            method: 'POST',
            body: JSON.stringify(taskData)
        });
    },

    async updateTask(id, taskData) {
        return this._fetch('/tasks/' + encodeURIComponent(id), {
            method: 'PUT',
            body: JSON.stringify(taskData)
        });
    },

    async deleteTask(id) {
        return this._fetch('/tasks/' + encodeURIComponent(id), {
            method: 'DELETE'
        });
    },

    async archiveTask(id) {
        return this._fetch('/tasks/' + encodeURIComponent(id) + '/archive', {
            method: 'POST'
        });
    },

    async unarchiveTask(id) {
        return this._fetch('/tasks/' + encodeURIComponent(id) + '/unarchive', {
            method: 'POST'
        });
    },

    async getArchivedTasks() {
        return this._fetch('/archived-tasks');
    },

    async deleteArchivedTask(id) {
        return this._fetch('/archived-tasks/' + encodeURIComponent(id), {
            method: 'DELETE'
        });
    }
};

window.TaskAPI = TaskAPI;
