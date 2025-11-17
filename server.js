// WebSocket Server für Echtzeit-Kollaboration
// Node.js Server mit WebSocket-Unterstützung

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// HTTP Server für statische Dateien
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// WebSocket Server
const wss = new WebSocket.Server({ server });

// Verbundene Clients
const clients = new Map();
let clientIdCounter = 1;

// Broadcast an alle Clients außer Sender
function broadcast(message, senderId) {
    const messageStr = JSON.stringify(message);
    clients.forEach((client, id) => {
        if (id !== senderId && client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
        }
    });
}

// Broadcast an alle Clients inkl. Sender
function broadcastAll(message) {
    const messageStr = JSON.stringify(message);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
        }
    });
}

wss.on('connection', (ws) => {
    const clientId = clientIdCounter++;
    clients.set(clientId, ws);
    
    console.log(`✅ Client ${clientId} verbunden. Aktive Verbindungen: ${clients.size}`);

    // Willkommensnachricht
    ws.send(JSON.stringify({
        type: 'connected',
        clientId: clientId,
        activeUsers: clients.size,
        timestamp: new Date().toISOString()
    }));

    // Benachrichtige andere Clients über neuen Benutzer
    broadcast({
        type: 'userJoined',
        clientId: clientId,
        activeUsers: clients.size,
        timestamp: new Date().toISOString()
    }, clientId);

    // Nachrichten verarbeiten
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`📨 Nachricht von Client ${clientId}:`, message.type);

            // Füge Metadaten hinzu
            message.senderId = clientId;
            message.timestamp = new Date().toISOString();

            // Verarbeite verschiedene Nachrichtentypen
            switch (message.type) {
                case 'taskCreated':
                case 'taskUpdated':
                case 'taskDeleted':
                case 'taskCompleted':
                case 'taskArchived':
                    // Broadcast Aufgaben-Updates
                    broadcast(message, clientId);
                    break;

                case 'sync':
                    // Client fordert Synchronisation an
                    // Sende bestätigung zurück
                    ws.send(JSON.stringify({
                        type: 'syncResponse',
                        timestamp: new Date().toISOString()
                    }));
                    break;

                case 'userActivity':
                    // Broadcast Benutzeraktivität (z.B. tippt gerade...)
                    broadcast(message, clientId);
                    break;

                case 'ping':
                    // Keep-alive
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: new Date().toISOString()
                    }));
                    break;

                default:
                    // Unbekannter Typ - einfach weiterleiten
                    broadcast(message, clientId);
            }
        } catch (error) {
            console.error('❌ Fehler beim Verarbeiten der Nachricht:', error);
        }
    });

    // Verbindung geschlossen
    ws.on('close', () => {
        clients.delete(clientId);
        console.log(`❌ Client ${clientId} getrennt. Aktive Verbindungen: ${clients.size}`);

        // Benachrichtige andere Clients
        broadcast({
            type: 'userLeft',
            clientId: clientId,
            activeUsers: clients.size,
            timestamp: new Date().toISOString()
        }, clientId);
    });

    // Fehlerbehandlung
    ws.on('error', (error) => {
        console.error(`⚠️ WebSocket-Fehler Client ${clientId}:`, error);
    });
});

// Keep-alive Ping alle 30 Sekunden
setInterval(() => {
    clients.forEach((client, id) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'ping',
                timestamp: new Date().toISOString()
            }));
        }
    });
}, 30000);

// Server starten
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('🚀 Gartenplaner Server gestartet');
    console.log(`📡 HTTP Server läuft auf http://localhost:${PORT}`);
    console.log(`🔌 WebSocket Server läuft auf ws://localhost:${PORT}`);
});
