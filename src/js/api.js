// API Client for Gartenplaner REST API
const TaskAPI = {
	baseUrl: "/api",

	getApiKey() {
		try {
			return localStorage.getItem("gardenplanner_api_key") || "";
		} catch {
			return "";
		}
	},

	setApiKey(key) {
		try {
			if (key) {
				localStorage.setItem("gardenplanner_api_key", key);
			} else {
				localStorage.removeItem("gardenplanner_api_key");
			}
		} catch {
			// localStorage unavailable
		}
	},

	async checkAuthRequired() {
		const res = await fetch(`${this.baseUrl}/auth/status`);
		const data = await res.json();
		return data.authRequired;
	},

	// Prüft einen Schlüssel ohne Seiteneffekte: "ok", "rejected" oder "unreachable".
	async verifyApiKey(key) {
		try {
			const res = await fetch(`${this.baseUrl}/tasks?page=1&limit=1`, {
				headers: { "X-API-Key": key },
			});
			if (res.ok) return "ok";
			return res.status === 401 ? "rejected" : "unreachable";
		} catch {
			return "unreachable";
		}
	},

	// Fehler tragen `network` (Server nicht erreichbar) bzw. `status` (HTTP-Antwort),
	// damit Aufrufer echte Offline-Fälle von Auth- und Serverfehlern trennen können.
	async _fetch(url, options = {}) {
		const { _retried, ...fetchOptions } = options;
		const headers = {
			"Content-Type": "application/json",
			...fetchOptions.headers,
		};
		const apiKey = this.getApiKey();
		if (apiKey) {
			headers["X-API-Key"] = apiKey;
		}
		let res;
		try {
			res = await fetch(this.baseUrl + url, { ...fetchOptions, headers });
		} catch {
			const error = new Error("Server nicht erreichbar");
			error.network = true;
			throw error;
		}
		if (res.status === 401 && !_retried && window.GP?.Auth) {
			// Schlüssel fehlt oder wurde abgelehnt: einmal nachfragen und wiederholen.
			if (await window.GP.Auth.handleUnauthorized(Boolean(apiKey))) {
				return this._fetch(url, { ...options, _retried: true });
			}
		}
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			const msg = body.errors
				? body.errors.join(", ")
				: body.error || `HTTP ${res.status}`;
			const error = new Error(msg);
			error.status = res.status;
			throw error;
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
		return this._fetch("/tasks", {
			method: "POST",
			body: JSON.stringify(taskData),
		});
	},

	async updateTask(id, taskData) {
		return this._fetch(`/tasks/${encodeURIComponent(id)}`, {
			method: "PUT",
			body: JSON.stringify(taskData),
		});
	},

	async deleteTask(id) {
		return this._fetch(`/tasks/${encodeURIComponent(id)}`, {
			method: "DELETE",
		});
	},

	async archiveTask(id) {
		return this._fetch(`/tasks/${encodeURIComponent(id)}/archive`, {
			method: "POST",
		});
	},

	async unarchiveTask(id) {
		return this._fetch(`/tasks/${encodeURIComponent(id)}/unarchive`, {
			method: "POST",
		});
	},

	async getArchivedTasks() {
		return this._fetch("/archived-tasks");
	},

	async deleteArchivedTask(id) {
		return this._fetch(`/archived-tasks/${encodeURIComponent(id)}`, {
			method: "DELETE",
		});
	},
};

window.TaskAPI = TaskAPI;
window.GP.TaskAPI = TaskAPI;
