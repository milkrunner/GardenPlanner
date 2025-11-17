// Echtzeit-Kollaboration über BroadcastChannel API und LocalStorage
// Keine Server-Komponente erforderlich - funktioniert rein im Browser!
// Synchronisiert Änderungen zwischen allen offenen Tabs/Fenstern

class CollaborationClient {
    constructor() {
        this.clientId = this.generateClientId();
        this.isConnected = false;
        this.eventHandlers = new Map();
        this.channel = null;
        this.storageKey = 'gartenplaner_sync';
        this.heartbeatInterval = null;
        this.activeClients = new Map(); // clientId -> lastSeen
        this.cleanupInterval = null;
        
        this.init();
    }

    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    init() {
        this.initBroadcastChannel();
        this.initStorageSync();
        this.startHeartbeat();
        this.startCleanup();
        this.announcePresence();
        
        // Cleanup bei Seiten-Verlassen
        window.addEventListener('beforeunload', () => {
            this.announceLeaving();
        });
    }

    // BroadcastChannel API für Tab-übergreifende Kommunikation
    initBroadcastChannel() {
        if ('BroadcastChannel' in window) {
            this.channel = new BroadcastChannel(this.storageKey);
            
            this.channel.onmessage = (event) => {
                this.handleMessage(event.data);
            };
            
            this.isConnected = true;
            console.log('✅ BroadcastChannel verbunden (Client:', this.clientId + ')');
            this.showNotification('🟢 Echtzeit-Synchronisation aktiv', 'success');
        } else {
            console.warn('⚠️ BroadcastChannel nicht verfügbar - falle zurück auf Storage-Events');
            this.isConnected = true;
        }
    }

    // Fallback: Storage Events für Cross-Origin Kommunikation
    initStorageSync() {
        window.addEventListener('storage', (event) => {
            if (event.key === this.storageKey && event.newValue) {
                try {
                    const message = JSON.parse(event.newValue);
                    if (message.senderId !== this.clientId) {
                        this.handleMessage(message);
                    }
                } catch (error) {
                    console.error('Fehler beim Parsen von Storage-Event:', error);
                }
            }
        });
    }

    // Heartbeat zum Tracken aktiver Clients
    startHeartbeat() {
        this.updatePresence();
        this.heartbeatInterval = setInterval(() => {
            this.updatePresence();
        }, 5000); // Alle 5 Sekunden
    }

    // Cleanup inaktiver Clients
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const timeout = 15000; // 15 Sekunden timeout
            
            for (const [clientId, lastSeen] of this.activeClients.entries()) {
                if (now - lastSeen > timeout) {
                    this.activeClients.delete(clientId);
                    console.log('🧹 Inaktiver Client entfernt:', clientId);
                }
            }
            
            this.updateActiveUsersCount();
        }, 10000); // Alle 10 Sekunden cleanup
    }

    updatePresence() {
        this.activeClients.set(this.clientId, Date.now());
        
        // In LocalStorage speichern für andere Tabs
        const presence = Object.fromEntries(this.activeClients);
        localStorage.setItem('gartenplaner_presence', JSON.stringify(presence));
        
        // Broadcast Heartbeat
        this.broadcast({
            type: 'heartbeat',
            clientId: this.clientId,
            timestamp: Date.now()
        });
    }

    announcePresence() {
        // Lade existierende Präsenz
        const storedPresence = localStorage.getItem('gartenplaner_presence');
        if (storedPresence) {
            try {
                const presence = JSON.parse(storedPresence);
                this.activeClients = new Map(Object.entries(presence));
            } catch (error) {
                console.error('Fehler beim Laden der Präsenz:', error);
            }
        }
        
        this.activeClients.set(this.clientId, Date.now());
        this.updateActiveUsersCount();
        
        this.broadcast({
            type: 'userJoined',
            clientId: this.clientId,
            timestamp: Date.now()
        });
    }

    announceLeaving() {
        this.broadcast({
            type: 'userLeft',
            clientId: this.clientId,
            timestamp: Date.now()
        });
    }

    broadcast(message) {
        message.senderId = this.clientId;
        message.timestamp = message.timestamp || Date.now();
        
        // BroadcastChannel (schnell, nur innerhalb der Origin)
        if (this.channel) {
            this.channel.postMessage(message);
        }
        
        // LocalStorage (Fallback, funktioniert auch cross-origin)
        localStorage.setItem(this.storageKey, JSON.stringify(message));
    }

    handleMessage(message) {
        // Ignoriere eigene Nachrichten
        if (message.senderId === this.clientId) {
            return;
        }
        
        console.log('📨 Empfangene Nachricht:', message.type, 'von', message.senderId);
        
        switch (message.type) {
            case 'heartbeat':
                this.activeClients.set(message.senderId, message.timestamp);
                this.updateActiveUsersCount();
                break;
                
            case 'userJoined':
                this.activeClients.set(message.senderId, message.timestamp);
                this.updateActiveUsersCount();
                this.showNotification(`👤 Neuer Tab geöffnet`, 'info');
                break;
                
            case 'userLeft':
                this.activeClients.delete(message.senderId);
                this.updateActiveUsersCount();
                this.showNotification(`👤 Tab geschlossen`, 'info');
                break;
                
            case 'taskCreated':
                this.handleTaskCreated(message);
                break;
                
            case 'taskUpdated':
                this.handleTaskUpdated(message);
                break;
                
            case 'taskDeleted':
                this.handleTaskDeleted(message);
                break;
                
            case 'taskCompleted':
                this.handleTaskCompleted(message);
                break;
                
            case 'taskArchived':
                this.handleTaskArchived(message);
                break;
                
            default:
                // Custom Event Handler
                if (this.eventHandlers.has(message.type)) {
                    this.eventHandlers.get(message.type)(message);
                }
        }
    }

    // Aufgaben-Event-Handler
    handleTaskCreated(message) {
        console.log('📝 Neue Aufgabe:', message.task.title);
        this.showNotification(`📝 Neue Aufgabe: ${message.task.title}`, 'success');
        
        if (window.gartenPlaner) {
            const tasks = window.gartenPlaner.loadTasks();
            // Prüfe ob Task schon existiert
            if (!tasks.find(t => t.id === message.task.id)) {
                tasks.push(message.task);
                localStorage.setItem('gartenplaner_tasks', JSON.stringify(tasks));
                window.gartenPlaner.renderTasks();
                window.gartenPlaner.updateStatistics();
            }
        }
    }

    handleTaskUpdated(message) {
        console.log('✏️ Aufgabe aktualisiert:', message.task.title);
        this.showNotification(`✏️ Aufgabe aktualisiert: ${message.task.title}`, 'info');
        
        if (window.gartenPlaner) {
            const tasks = window.gartenPlaner.loadTasks();
            const index = tasks.findIndex(t => t.id === message.task.id);
            if (index !== -1) {
                tasks[index] = message.task;
                localStorage.setItem('gartenplaner_tasks', JSON.stringify(tasks));
                window.gartenPlaner.renderTasks();
                window.gartenPlaner.updateStatistics();
            }
        }
    }

    handleTaskDeleted(message) {
        console.log('🗑️ Aufgabe gelöscht:', message.taskId);
        this.showNotification('🗑️ Aufgabe wurde gelöscht', 'warning');
        
        if (window.gartenPlaner) {
            const tasks = window.gartenPlaner.loadTasks();
            const filtered = tasks.filter(t => t.id !== message.taskId);
            localStorage.setItem('gartenplaner_tasks', JSON.stringify(filtered));
            window.gartenPlaner.renderTasks();
            window.gartenPlaner.updateStatistics();
        }
    }

    handleTaskCompleted(message) {
        console.log('✅ Aufgabe abgeschlossen:', message.taskId);
        this.showNotification(`✅ Aufgabe abgeschlossen`, 'success');
        
        if (window.gartenPlaner) {
            const tasks = window.gartenPlaner.loadTasks();
            const task = tasks.find(t => t.id === message.taskId);
            if (task) {
                task.status = 'completed';
                task.completedAt = message.completedAt;
                localStorage.setItem('gartenplaner_tasks', JSON.stringify(tasks));
                window.gartenPlaner.renderTasks();
                window.gartenPlaner.updateStatistics();
            }
        }
    }

    handleTaskArchived(message) {
        console.log('📦 Aufgabe archiviert:', message.taskId);
        this.showNotification('📦 Aufgabe archiviert', 'info');
        
        if (window.gartenPlaner) {
            const tasks = window.gartenPlaner.loadTasks();
            const task = tasks.find(t => t.id === message.taskId);
            if (task) {
                task.archived = true;
                localStorage.setItem('gartenplaner_tasks', JSON.stringify(tasks));
                window.gartenPlaner.renderTasks();
                window.gartenPlaner.updateStatistics();
            }
        }
    }

    // Öffentliche API - Broadcast-Methoden
    broadcastTaskCreated(task) {
        this.broadcast({
            type: 'taskCreated',
            task: task
        });
    }

    broadcastTaskUpdated(task) {
        this.broadcast({
            type: 'taskUpdated',
            task: task
        });
    }

    broadcastTaskDeleted(taskId) {
        this.broadcast({
            type: 'taskDeleted',
            taskId: taskId
        });
    }

    broadcastTaskCompleted(taskId, completedAt) {
        this.broadcast({
            type: 'taskCompleted',
            taskId: taskId,
            completedAt: completedAt
        });
    }

    broadcastTaskArchived(taskId) {
        this.broadcast({
            type: 'taskArchived',
            taskId: taskId
        });
    }

    // Custom Event Handler registrieren
    on(eventType, handler) {
        this.eventHandlers.set(eventType, handler);
    }

    // UI-Hilfsfunktionen
    updateActiveUsersCount() {
        const count = this.activeClients.size;
        const indicator = document.getElementById('activeUsersIndicator');
        if (indicator) {
            indicator.textContent = `👥 ${count} ${count === 1 ? 'Tab' : 'Tabs'} offen`;
            indicator.className = 'active-users-indicator active';
        }
        
        const statusDot = document.getElementById('connectionStatus');
        if (statusDot) {
            statusDot.className = 'connection-status connected';
        }
    }

    showNotification(message, type = 'info') {
        // Erstelle Toast-Benachrichtigung
        const toast = document.createElement('div');
        toast.className = `collaboration-toast toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Animation
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Auto-remove nach 3 Sekunden
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    disconnect() {
        if (this.channel) {
            this.announceLeaving();
            this.channel.close();
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        this.isConnected = false;
        console.log('❌ Kollaboration getrennt');
    }
}

// Global verfügbar machen
window.CollaborationClient = CollaborationClient;
