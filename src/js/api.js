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
            return;
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
        return this._fetch(`/tasks${qs ? `?${qs}` : ""}`);
    },

    async getTask(id) {
        return this._fetch(`/tasks/${encodeURIComponent(id)}`);
    },

    async createTask(taskData) {
        return this._fetch("/tasks", { method: "POST", body: JSON.stringify(taskData) });
    },

    async updateTask(id, taskData) {
        return this._fetch(`/tasks/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(taskData) });
    },

    async deleteTask(id) {
        return this._fetch(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
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
};

window.TaskAPI = TaskAPI;
if (window.GP) window.GP.TaskAPI = TaskAPI;
