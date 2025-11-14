const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Datenbank initialisieren
const db = new sqlite3.Database('./garden_planner.db', (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Datenbank:', err.message);
    } else {
        console.log('✅ Verbunden mit SQLite Datenbank');
        initializeDatabase();
    }
});

// Datenbank-Tabellen erstellen
function initializeDatabase() {
    db.serialize(() => {
        // Workers Tabelle
        db.run(`CREATE TABLE IF NOT EXISTS workers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tasks Tabelle
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            location TEXT,
            priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'pending',
            estimated_hours REAL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Task Assignments (Viele-zu-Viele Beziehung)
        db.run(`CREATE TABLE IF NOT EXISTS task_assignments (
            task_id TEXT,
            worker_id TEXT,
            PRIMARY KEY (task_id, worker_id),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
        )`);

        // Schedules Tabelle
        db.run(`CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            worker_id TEXT NOT NULL,
            date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
        )`);

        console.log('✅ Datenbank-Tabellen initialisiert');
        seedDefaultData();
    });
}

// Standarddaten einfügen (nur beim ersten Start)
function seedDefaultData() {
    db.get('SELECT COUNT(*) as count FROM workers', (err, row) => {
        if (err) {
            console.error('Fehler beim Prüfen der Daten:', err.message);
            return;
        }

        if (row.count === 0) {
            console.log('🌱 Füge Standarddaten ein...');
            
            const workers = [
                { id: '1', name: 'Max Mustermann' },
                { id: '2', name: 'Anna Schmidt' },
                { id: '3', name: 'Tom Weber' }
            ];

            const tasks = [
                {
                    id: '1',
                    title: 'Rasen mähen',
                    description: 'Hauptrasen im Vorgarten mähen und Kanten schneiden',
                    location: 'Vorgarten',
                    priority: 'high',
                    status: 'pending',
                    estimatedHours: 2,
                    assignedTo: ['1']
                },
                {
                    id: '2',
                    title: 'Blumenbeete anlegen',
                    description: 'Neue Blumenbeete im hinteren Bereich anlegen',
                    location: 'Hintergarten',
                    priority: 'medium',
                    status: 'in-progress',
                    estimatedHours: 4,
                    assignedTo: ['2']
                },
                {
                    id: '3',
                    title: 'Hecke schneiden',
                    description: 'Gesamte Grundstückshecke zurückschneiden',
                    location: 'Grundstücksgrenze',
                    priority: 'low',
                    status: 'pending',
                    estimatedHours: 3,
                    assignedTo: ['3']
                }
            ];

            const today = new Date().toISOString().split('T')[0];
            const schedules = [
                {
                    id: '1',
                    taskId: '1',
                    workerId: '1',
                    date: today,
                    startTime: '08:00',
                    endTime: '10:00',
                    notes: 'Morgens, wenn es noch kühl ist'
                },
                {
                    id: '2',
                    taskId: '2',
                    workerId: '2',
                    date: today,
                    startTime: '09:00',
                    endTime: '13:00',
                    notes: 'Materialien bereits vor Ort'
                }
            ];

            // Workers einfügen
            workers.forEach(worker => {
                db.run('INSERT INTO workers (id, name) VALUES (?, ?)', [worker.id, worker.name]);
            });

            // Tasks einfügen
            tasks.forEach(task => {
                db.run(
                    'INSERT INTO tasks (id, title, description, location, priority, status, estimated_hours) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [task.id, task.title, task.description, task.location, task.priority, task.status, task.estimatedHours],
                    function(err) {
                        if (!err && task.assignedTo) {
                            task.assignedTo.forEach(workerId => {
                                db.run('INSERT INTO task_assignments (task_id, worker_id) VALUES (?, ?)', [task.id, workerId]);
                            });
                        }
                    }
                );
            });

            // Schedules einfügen
            schedules.forEach(schedule => {
                db.run(
                    'INSERT INTO schedules (id, task_id, worker_id, date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [schedule.id, schedule.taskId, schedule.workerId, schedule.date, schedule.startTime, schedule.endTime, schedule.notes]
                );
            });

            console.log('✅ Standarddaten eingefügt');
        }
    });
}

// ============== API ENDPOINTS ==============

// Workers API
app.get('/api/workers', (req, res) => {
    db.all('SELECT * FROM workers ORDER BY name', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/workers', (req, res) => {
    const { name } = req.body;
    const id = Date.now().toString();
    
    db.run('INSERT INTO workers (id, name) VALUES (?, ?)', [id, name], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id, name });
    });
});

app.put('/api/workers/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    
    db.run('UPDATE workers SET name = ? WHERE id = ?', [name, id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id, name });
    });
});

app.delete('/api/workers/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM workers WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

// Tasks API
app.get('/api/tasks', (req, res) => {
    db.all('SELECT * FROM tasks ORDER BY created_at DESC', [], (err, tasks) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Lade die zugewiesenen Arbeiter für jede Aufgabe
        const tasksWithAssignments = tasks.map(task => {
            return new Promise((resolve) => {
                db.all(
                    'SELECT worker_id FROM task_assignments WHERE task_id = ?',
                    [task.id],
                    (err, assignments) => {
                        task.assignedTo = assignments ? assignments.map(a => a.worker_id) : [];
                        resolve(task);
                    }
                );
            });
        });
        
        Promise.all(tasksWithAssignments).then(results => {
            res.json(results);
        });
    });
});

app.post('/api/tasks', (req, res) => {
    const { title, description, location, priority, status, estimatedHours, assignedTo } = req.body;
    const id = Date.now().toString();
    
    db.run(
        'INSERT INTO tasks (id, title, description, location, priority, status, estimated_hours) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, title, description, location, priority, status, estimatedHours],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Zuweisungen einfügen
            if (assignedTo && assignedTo.length > 0) {
                assignedTo.forEach(workerId => {
                    db.run('INSERT INTO task_assignments (task_id, worker_id) VALUES (?, ?)', [id, workerId]);
                });
            }
            
            res.json({ id, title, description, location, priority, status, estimatedHours, assignedTo });
        }
    );
});

app.put('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const { title, description, location, priority, status, estimatedHours, assignedTo } = req.body;
    
    db.run(
        'UPDATE tasks SET title = ?, description = ?, location = ?, priority = ?, status = ?, estimated_hours = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [title, description, location, priority, status, estimatedHours, id],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Zuweisungen aktualisieren
            db.run('DELETE FROM task_assignments WHERE task_id = ?', [id], () => {
                if (assignedTo && assignedTo.length > 0) {
                    assignedTo.forEach(workerId => {
                        db.run('INSERT INTO task_assignments (task_id, worker_id) VALUES (?, ?)', [id, workerId]);
                    });
                }
                res.json({ id, title, description, location, priority, status, estimatedHours, assignedTo });
            });
        }
    );
});

app.delete('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

// Schedules API
app.get('/api/schedules', (req, res) => {
    db.all('SELECT * FROM schedules ORDER BY date, start_time', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows.map(row => ({
            id: row.id,
            taskId: row.task_id,
            workerId: row.worker_id,
            date: row.date,
            startTime: row.start_time,
            endTime: row.end_time,
            notes: row.notes
        })));
    });
});

app.post('/api/schedules', (req, res) => {
    const { taskId, workerId, date, startTime, endTime, notes } = req.body;
    const id = Date.now().toString();
    
    db.run(
        'INSERT INTO schedules (id, task_id, worker_id, date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, taskId, workerId, date, startTime, endTime, notes],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id, taskId, workerId, date, startTime, endTime, notes });
        }
    );
});

app.put('/api/schedules/:id', (req, res) => {
    const { id } = req.params;
    const { taskId, workerId, date, startTime, endTime, notes } = req.body;
    
    db.run(
        'UPDATE schedules SET task_id = ?, worker_id = ?, date = ?, start_time = ?, end_time = ?, notes = ? WHERE id = ?',
        [taskId, workerId, date, startTime, endTime, notes, id],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id, taskId, workerId, date, startTime, endTime, notes });
        }
    );
});

app.delete('/api/schedules/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM schedules WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

// Hauptseite ausliefern
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server starten
app.listen(PORT, () => {
    console.log(`🚀 Server läuft auf http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Fehler beim Schließen der Datenbank:', err.message);
        } else {
            console.log('Datenbank-Verbindung geschlossen');
        }
        process.exit(0);
    });
});
