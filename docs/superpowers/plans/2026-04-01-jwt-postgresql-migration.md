# JWT + PostgreSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace JSON file storage with PostgreSQL and implement multi-user JWT authentication with admin role and user management.

**Architecture:** PostgreSQL 16 in Docker Compose alongside the app. New `postgres-store.js` replaces `json-store.js` as a drop-in. JWT in HttpOnly cookies with 24h expiry. Admin users manage other users via API + UI. Migration script imports existing tasks.json on first run.

**Tech Stack:** Node.js, Express 4, PostgreSQL 16, pg (node-postgres), bcrypt, jsonwebtoken, Jest + Supertest

---

## File Structure

| Task | Action | File | Responsibility |
|------|--------|------|----------------|
| 1 | Modify | `package.json` | Add pg, bcrypt, jsonwebtoken dependencies |
| 1 | Modify | `docker-compose.yml` | Add PostgreSQL service, update app env |
| 1 | Modify | `Dockerfile` | No change needed (deps installed via npm ci) |
| 1 | Modify | `.env.example` | Add DATABASE_URL, JWT_SECRET, DB_PASSWORD |
| 2 | Create | `src/server/storage/db.js` | PostgreSQL connection pool |
| 2 | Create | `scripts/migrate.js` | Schema creation + JSON data import |
| 3 | Create | `src/server/storage/postgres-store.js` | Task CRUD via SQL (replaces json-store) |
| 3 | Modify | `src/server/services/task-service.js` | Switch import from json-store to postgres-store |
| 3 | Modify | `src/server/app.js` | Switch import, remove json-store refs |
| 4 | Create | `src/server/services/user-service.js` | User CRUD with bcrypt |
| 4 | Create | `tests/user-service.test.js` | User service tests |
| 5 | Modify | `src/server/middleware/auth.js` | JWT cookie verification replacing API-Key |
| 5 | Create | `src/server/middleware/require-admin.js` | Admin role guard |
| 5 | Modify | `src/server/routes/auth.js` | Login, logout, status endpoints |
| 5 | Create | `tests/auth.test.js` | Auth endpoint tests |
| 6 | Create | `src/server/routes/admin.js` | User management CRUD endpoints |
| 6 | Modify | `src/server/app.js` | Mount admin routes |
| 7 | Create | `public/login.html` | Login page |
| 7 | Create | `public/admin.html` | User management page |
| 7 | Modify | `src/js/api.js` | Remove API-Key, add cookie-based auth |
| 7 | Modify | `src/css/styles.css` | Login + admin page styles |
| 8 | Create | `scripts/seed-admin.js` | CLI to create initial admin user |
| 8 | Modify | `server.js` | Run migration on startup |
| 8 | Modify | `tests/server.test.js` | Update to use PostgreSQL test DB |

---

## Task 1: Docker Compose + Dependencies

**Files:**
- Modify: `package.json`
- Modify: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Add dependencies**

```bash
npm install pg bcrypt jsonwebtoken
```

- [ ] **Step 2: Update docker-compose.yml**

Replace entire content of `docker-compose.yml`:

```yaml
services:
  gartenplaner:
    build: .
    container_name: gartenplaner
    ports:
      - "8080:3000"
    restart: unless-stopped
    environment:
      - TZ=Europe/Berlin
      - NODE_ENV=production
      - DATABASE_URL=postgres://gartenplaner:${DB_PASSWORD:-gartenplaner}@db:5432/gartenplaner
      - JWT_SECRET=${JWT_SECRET:-change-me-in-production}
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - gartenplaner-data:/app/data
    labels:
      - "description=Gartenplaner Web Application with REST API"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  db:
    image: postgres:16-alpine
    container_name: gartenplaner-db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=gartenplaner
      - POSTGRES_USER=gartenplaner
      - POSTGRES_PASSWORD=${DB_PASSWORD:-gartenplaner}
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gartenplaner"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  gartenplaner-data:
  db-data:
```

- [ ] **Step 3: Create .env.example**

```bash
# Database
DB_PASSWORD=gartenplaner

# Auth (leave empty to disable authentication)
JWT_SECRET=change-me-to-a-random-string

# Server
PORT=3000
```

- [ ] **Step 4: Update package.json scripts**

Add to `scripts` section:

```json
"migrate": "node scripts/migrate.js",
"seed-admin": "node scripts/seed-admin.js"
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json docker-compose.yml .env.example
git commit -m "chore: add PostgreSQL, bcrypt, jsonwebtoken deps and Docker Compose DB service"
```

---

## Task 2: Database Connection + Migration Script

**Files:**
- Create: `src/server/storage/db.js`
- Create: `scripts/migrate.js`

- [ ] **Step 1: Create database connection pool**

Create `src/server/storage/db.js`:

```javascript
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10
});

pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
});

async function query(text, params) {
    return pool.query(text, params);
}

async function getClient() {
    return pool.connect();
}

async function close() {
    return pool.end();
}

module.exports = { query, getClient, close, pool };
```

- [ ] **Step 2: Create migration script**

Create `scripts/migrate.js`:

```javascript
const { query, close } = require('../src/server/storage/db');
const fs = require('fs');
const path = require('path');

const TASKS_FILE = path.join(__dirname, '..', 'data', 'tasks.json');
const ARCHIVED_FILE = path.join(__dirname, '..', 'data', 'archived-tasks.json');

async function migrate() {
    console.log('Running database migration...');

    // Create tables
    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS tasks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(200) NOT NULL,
            employee VARCHAR(100),
            location VARCHAR(100) NOT NULL,
            description TEXT,
            notes TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            priority VARCHAR(10) DEFAULT 'medium',
            recurrence VARCHAR(20) DEFAULT 'none',
            subtasks JSONB DEFAULT '[]',
            history JSONB DEFAULT '[]',
            sort_order BIGINT DEFAULT extract(epoch from now()) * 1000,
            completed_at TIMESTAMPTZ,
            archived_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    console.log('Tables created.');

    // Import existing JSON data if tables are empty and files exist
    const { rows } = await query('SELECT count(*) as cnt FROM tasks');
    if (parseInt(rows[0].cnt) === 0) {
        let imported = 0;
        if (fs.existsSync(TASKS_FILE)) {
            const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
            for (const t of tasks) {
                await query(`
                    INSERT INTO tasks (id, title, employee, location, description, notes, status, priority, recurrence, subtasks, history, sort_order, completed_at, created_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                    ON CONFLICT (id) DO NOTHING
                `, [
                    t.id, t.title, t.employee || '', t.location, t.description || '', t.notes || '',
                    t.status || 'pending', t.priority || 'medium', t.recurrence || 'none',
                    JSON.stringify(t.subtasks || []), JSON.stringify(t.history || []),
                    t.sortOrder || Date.now(),
                    t.completedAt || null, t.createdAt || new Date().toISOString()
                ]);
                imported++;
            }
            console.log(`Imported ${imported} active tasks from tasks.json`);
        }

        if (fs.existsSync(ARCHIVED_FILE)) {
            const archived = JSON.parse(fs.readFileSync(ARCHIVED_FILE, 'utf8'));
            let archivedCount = 0;
            for (const t of archived) {
                await query(`
                    INSERT INTO tasks (id, title, employee, location, description, notes, status, priority, recurrence, subtasks, history, sort_order, completed_at, archived_at, created_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
                    ON CONFLICT (id) DO NOTHING
                `, [
                    t.id, t.title, t.employee || '', t.location, t.description || '', t.notes || '',
                    t.status || 'pending', t.priority || 'medium', t.recurrence || 'none',
                    JSON.stringify(t.subtasks || []), JSON.stringify(t.history || []),
                    t.sortOrder || Date.now(),
                    t.completedAt || null, t.archivedAt || new Date().toISOString(),
                    t.createdAt || new Date().toISOString()
                ]);
                archivedCount++;
            }
            console.log(`Imported ${archivedCount} archived tasks from archived-tasks.json`);
        }
    } else {
        console.log('Tasks table not empty, skipping JSON import.');
    }

    console.log('Migration complete.');
}

if (require.main === module) {
    migrate().then(() => close()).catch(err => {
        console.error('Migration failed:', err);
        close();
        process.exit(1);
    });
}

module.exports = { migrate };
```

- [ ] **Step 3: Commit**

```bash
git add src/server/storage/db.js scripts/migrate.js
git commit -m "feat: add PostgreSQL connection pool and migration script"
```

---

## Task 3: PostgreSQL Storage Layer (replaces json-store)

**Files:**
- Create: `src/server/storage/postgres-store.js`
- Modify: `src/server/services/task-service.js`
- Modify: `src/server/app.js`

- [ ] **Step 1: Create postgres-store.js**

Create `src/server/storage/postgres-store.js`:

```javascript
const { query } = require('./db');

function rowToTask(row) {
    return {
        id: row.id,
        title: row.title,
        employee: row.employee || '',
        location: row.location,
        description: row.description || '',
        notes: row.notes || '',
        status: row.status,
        priority: row.priority,
        recurrence: row.recurrence,
        subtasks: row.subtasks || [],
        history: row.history || [],
        sortOrder: parseInt(row.sort_order),
        completedAt: row.completed_at,
        archivedAt: row.archived_at,
        createdAt: row.created_at
    };
}

async function readTasks() {
    const { rows } = await query(
        'SELECT * FROM tasks WHERE archived_at IS NULL ORDER BY sort_order DESC'
    );
    return rows.map(rowToTask);
}

async function readArchivedTasks() {
    const { rows } = await query(
        'SELECT * FROM tasks WHERE archived_at IS NOT NULL ORDER BY archived_at DESC'
    );
    return rows.map(rowToTask);
}

async function createTask(task) {
    const { rows } = await query(`
        INSERT INTO tasks (id, title, employee, location, description, notes, status, priority, recurrence, subtasks, history, sort_order, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
    `, [
        task.id, task.title, task.employee, task.location,
        task.description, task.notes, task.status, task.priority, task.recurrence,
        JSON.stringify(task.subtasks), JSON.stringify(task.history),
        task.sortOrder, task.createdAt
    ]);
    return rowToTask(rows[0]);
}

async function getTaskById(id) {
    const { rows } = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    return rows.length ? rowToTask(rows[0]) : null;
}

async function updateTask(id, fields) {
    const setClauses = [];
    const values = [];
    let idx = 1;

    const columnMap = {
        title: 'title', employee: 'employee', location: 'location',
        description: 'description', notes: 'notes', status: 'status',
        priority: 'priority', recurrence: 'recurrence',
        sortOrder: 'sort_order', completedAt: 'completed_at'
    };

    for (const [key, col] of Object.entries(columnMap)) {
        if (fields[key] !== undefined) {
            setClauses.push(`${col} = $${idx++}`);
            values.push(fields[key]);
        }
    }
    if (fields.subtasks !== undefined) {
        setClauses.push(`subtasks = $${idx++}`);
        values.push(JSON.stringify(fields.subtasks));
    }
    if (fields.history !== undefined) {
        setClauses.push(`history = $${idx++}`);
        values.push(JSON.stringify(fields.history));
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await query(
        `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
    );
    return rows.length ? rowToTask(rows[0]) : null;
}

async function deleteTask(id) {
    const { rowCount } = await query('DELETE FROM tasks WHERE id = $1', [id]);
    return rowCount > 0;
}

async function archiveTask(id) {
    const { rows } = await query(
        `UPDATE tasks SET archived_at = NOW(), updated_at = NOW() WHERE id = $1 AND archived_at IS NULL RETURNING *`,
        [id]
    );
    return rows.length ? rowToTask(rows[0]) : null;
}

async function unarchiveTask(id) {
    const { rows } = await query(
        `UPDATE tasks SET archived_at = NULL, updated_at = NOW() WHERE id = $1 AND archived_at IS NOT NULL RETURNING *`,
        [id]
    );
    return rows.length ? rowToTask(rows[0]) : null;
}

module.exports = {
    readTasks, readArchivedTasks, createTask, getTaskById,
    updateTask, deleteTask, archiveTask, unarchiveTask
};
```

- [ ] **Step 2: Rewrite task-service.js to use postgres-store**

Replace the imports at the top of `src/server/services/task-service.js`. Remove all `json-store` imports and replace with `postgres-store`:

```javascript
const { v4: uuidv4 } = require('uuid');
const { audit } = require('../logger');
const { PAGINATION } = require('../config');
const { validateTask, sanitizeTaskData } = require('../validation/task-validator');
const store = require('../storage/postgres-store');
```

Then rewrite each function to use `store.*` instead of direct array manipulation. The key changes:
- `listTasks` becomes async, calls `await store.readTasks()` then filters/paginates in JS
- `getTask` becomes `await store.getTaskById(id)`
- `createTask` builds the task object, calls `await store.createTask(task)`
- `updateTask` loads with `store.getTaskById`, applies changes, calls `store.updateTask`
- `deleteTask` calls `store.deleteTask(id)`
- `archiveTask` calls `store.archiveTask(id)` (no more dual-file locking)
- `unarchiveTask` calls `store.unarchiveTask(id)`
- Remove `withLockedTasks`, `withLockedArchive`, `acquireLock`, `releaseLock` usage entirely

All methods already return `{ error, task }` objects — keep that interface.

- [ ] **Step 3: Update app.js imports**

In `src/server/app.js`:
- Remove: `const { resetCaches } = require('./storage/json-store');`
- Remove `resetCaches` from module.exports
- The rest of app.js stays the same (routes, middleware)

- [ ] **Step 4: Run tests to verify compilation**

```bash
node -e "require('./src/server/app')"
```

Expected: No require errors. (Full test suite will fail until test DB is set up in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/server/storage/postgres-store.js src/server/services/task-service.js src/server/app.js
git commit -m "feat: replace json-store with PostgreSQL storage layer"
```

---

## Task 4: User Service

**Files:**
- Create: `src/server/services/user-service.js`

- [ ] **Step 1: Create user-service.js**

```javascript
const bcrypt = require('bcrypt');
const { query } = require('../storage/db');

const SALT_ROUNDS = 12;

async function createUser(username, password, role = 'user') {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows } = await query(
        `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at`,
        [username, hash, role]
    );
    return rows[0];
}

async function findByUsername(username) {
    const { rows } = await query('SELECT * FROM users WHERE username = $1', [username]);
    return rows[0] || null;
}

async function findById(id) {
    const { rows } = await query(
        'SELECT id, username, role, created_at, updated_at FROM users WHERE id = $1', [id]
    );
    return rows[0] || null;
}

async function listUsers() {
    const { rows } = await query(
        'SELECT id, username, role, created_at, updated_at FROM users ORDER BY created_at'
    );
    return rows;
}

async function verifyPassword(user, password) {
    return bcrypt.compare(password, user.password_hash);
}

async function updateUser(id, { password, role }) {
    const sets = [];
    const vals = [];
    let idx = 1;

    if (password) {
        sets.push(`password_hash = $${idx++}`);
        vals.push(await bcrypt.hash(password, SALT_ROUNDS));
    }
    if (role) {
        sets.push(`role = $${idx++}`);
        vals.push(role);
    }
    sets.push(`updated_at = NOW()`);
    vals.push(id);

    const { rows } = await query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, username, role, created_at, updated_at`,
        vals
    );
    return rows[0] || null;
}

async function deleteUser(id) {
    const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id]);
    return rowCount > 0;
}

async function countAdmins() {
    const { rows } = await query("SELECT count(*) as cnt FROM users WHERE role = 'admin'");
    return parseInt(rows[0].cnt);
}

module.exports = { createUser, findByUsername, findById, listUsers, verifyPassword, updateUser, deleteUser, countAdmins };
```

- [ ] **Step 2: Commit**

```bash
git add src/server/services/user-service.js
git commit -m "feat: add user service with bcrypt password hashing"
```

---

## Task 5: JWT Auth Middleware + Auth Routes

**Files:**
- Modify: `src/server/middleware/auth.js`
- Create: `src/server/middleware/require-admin.js`
- Modify: `src/server/routes/auth.js`
- Modify: `src/server/app.js`

- [ ] **Step 1: Replace auth.js with JWT cookie verification**

Replace entire `src/server/middleware/auth.js`:

```javascript
const jwt = require('jsonwebtoken');
const { audit } = require('../logger');

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRY = '24h';

function parseCookies(cookieHeader) {
    if (!cookieHeader) return {};
    return Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [key, ...rest] = c.trim().split('=');
            return [key, rest.join('=')];
        })
    );
}

function jwtAuth(req, res, next) {
    // Auth status and login are always accessible
    if (req.path === '/auth/status' || req.path === '/auth/login') {
        return next();
    }

    // No JWT_SECRET = auth disabled
    if (!JWT_SECRET) {
        return next();
    }

    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.token;

    if (!token) {
        audit('auth_failure', { ip: req.ip, path: req.originalUrl, reason: 'no token' });
        return res.status(401).json({ error: true, status: 401, message: 'Authentication required' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = { id: payload.sub, username: payload.username, role: payload.role };
        next();
    } catch (err) {
        audit('auth_failure', { ip: req.ip, path: req.originalUrl, reason: err.message });
        return res.status(401).json({ error: true, status: 401, message: 'Invalid or expired token' });
    }
}

function signToken(user) {
    return jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

function setTokenCookie(res, token) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie',
        `token=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${isProduction ? '; Secure' : ''}`
    );
}

function clearTokenCookie(res) {
    res.setHeader('Set-Cookie', 'token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

module.exports = { jwtAuth, signToken, setTokenCookie, clearTokenCookie, JWT_SECRET };
```

- [ ] **Step 2: Create require-admin.js**

Create `src/server/middleware/require-admin.js`:

```javascript
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: true, status: 403, message: 'Admin access required' });
    }
    next();
}

module.exports = { requireAdmin };
```

- [ ] **Step 3: Rewrite auth routes**

Replace entire `src/server/routes/auth.js`:

```javascript
const express = require('express');
const router = express.Router();
const { findByUsername, verifyPassword } = require('../services/user-service');
const { signToken, setTokenCookie, clearTokenCookie, JWT_SECRET } = require('../middleware/auth');
const { audit } = require('../logger');

router.get('/status', (req, res) => {
    res.json({
        authRequired: !!JWT_SECRET,
        user: req.user || null
    });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({ error: true, status: 400, message: 'Username and password required' });
    }

    const user = await findByUsername(username);
    if (!user || !(await verifyPassword(user, password))) {
        audit('login_failure', { ip: req.ip, username });
        return res.status(401).json({ error: true, status: 401, message: 'Invalid credentials' });
    }

    const token = signToken(user);
    setTokenCookie(res, token);
    audit('login_success', { ip: req.ip, username, userId: user.id });
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
});

router.post('/logout', (req, res) => {
    clearTokenCookie(res);
    res.json({ message: 'Logged out' });
});

module.exports = router;
```

- [ ] **Step 4: Update app.js for JWT auth**

In `src/server/app.js`:
- Replace import: `const { apiKeyAuth } = require('./middleware/auth');` → `const { jwtAuth } = require('./middleware/auth');`
- Replace all `apiKeyAuth` references with `jwtAuth`
- Add admin routes import and mounting (see Task 6)

- [ ] **Step 5: Commit**

```bash
git add src/server/middleware/auth.js src/server/middleware/require-admin.js src/server/routes/auth.js src/server/app.js
git commit -m "feat: implement JWT authentication with HttpOnly cookies"
```

---

## Task 6: Admin Routes (User Management API)

**Files:**
- Create: `src/server/routes/admin.js`
- Modify: `src/server/app.js`

- [ ] **Step 1: Create admin routes**

Create `src/server/routes/admin.js`:

```javascript
const express = require('express');
const router = express.Router();
const { createUser, listUsers, findById, updateUser, deleteUser, countAdmins } = require('../services/user-service');
const { audit } = require('../logger');

router.get('/users', async (req, res) => {
    const users = await listUsers();
    res.json(users);
});

router.post('/users', async (req, res) => {
    const { username, password, role } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: true, status: 400, message: 'Username and password required' });
    }
    if (role && !['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: true, status: 400, message: 'Role must be admin or user' });
    }
    try {
        const user = await createUser(username, password, role || 'user');
        audit('user_created', { by: req.user.username, username, role: role || 'user' });
        res.status(201).json(user);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: true, status: 409, message: 'Username already exists' });
        }
        throw err;
    }
});

router.put('/users/:id', async (req, res) => {
    const { password, role } = req.body || {};
    if (!password && !role) {
        return res.status(400).json({ error: true, status: 400, message: 'Provide password or role to update' });
    }
    if (role && !['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: true, status: 400, message: 'Role must be admin or user' });
    }
    const user = await updateUser(req.params.id, { password, role });
    if (!user) {
        return res.status(404).json({ error: true, status: 404, message: 'User not found' });
    }
    audit('user_updated', { by: req.user.username, targetId: req.params.id, roleChanged: !!role });
    res.json(user);
});

router.delete('/users/:id', async (req, res) => {
    if (req.params.id === req.user.id) {
        return res.status(400).json({ error: true, status: 400, message: 'Cannot delete yourself' });
    }
    const target = await findById(req.params.id);
    if (!target) {
        return res.status(404).json({ error: true, status: 404, message: 'User not found' });
    }
    if (target.role === 'admin') {
        const adminCount = await countAdmins();
        if (adminCount <= 1) {
            return res.status(400).json({ error: true, status: 400, message: 'Cannot delete the last admin' });
        }
    }
    await deleteUser(req.params.id);
    audit('user_deleted', { by: req.user.username, targetId: req.params.id, username: target.username });
    res.status(204).send();
});

module.exports = router;
```

- [ ] **Step 2: Mount admin routes in app.js**

Add import and mount in `src/server/app.js`:

```javascript
// After other route imports:
const adminRouter = require('./routes/admin');
const { requireAdmin } = require('./middleware/require-admin');

// In API Routes section:
app.use('/api/v1/admin', requireAdmin, adminRouter);
app.use('/api/admin', requireAdmin, adminRouter);
```

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/admin.js src/server/app.js
git commit -m "feat: add admin user management API endpoints"
```

---

## Task 7: Frontend — Login Page, Admin Page, API Client Update

**Files:**
- Create: `public/login.html`
- Create: `public/admin.html`
- Modify: `src/js/api.js`
- Modify: `src/css/styles.css`
- Modify: `src/server/app.js`

- [ ] **Step 1: Create login.html**

Create `public/login.html` — a simple login form following the Botanical theme. Should include:
- Username + password fields
- Submit button
- Error message display area
- Redirect to `/dashboard` on success
- Script that POSTs to `/api/v1/auth/login` and sets the cookie

- [ ] **Step 2: Create admin.html**

Create `public/admin.html` — admin user management page:
- Table listing all users (username, role, created_at)
- "Neuer Benutzer" button that opens a form (username, password, role)
- Edit role button per user
- Delete button per user (with confirmation dialog)
- Only accessible to admin role (redirect to dashboard if not admin)

- [ ] **Step 3: Update api.js**

Replace `src/js/api.js` — remove all API-Key logic, add cookie-based auth:

```javascript
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

    // ... getTasks, getTask, createTask, updateTask, deleteTask,
    // archiveTask, unarchiveTask, getArchivedTasks, deleteArchivedTask
    // remain the same but without API-Key header
};
```

Keep all existing CRUD methods — just remove the API-Key header injection.

- [ ] **Step 4: Add login + admin routes to app.js**

Add `login` and `admin` to the `pages` array in app.js, or add explicit routes:

```javascript
const pages = ['index', 'dashboard', 'statistics', 'logs', 'plants', 'login', 'admin'];
```

- [ ] **Step 5: Add CSS for login and admin pages**

Append to `src/css/styles.css` under `/* === Login + Admin === */`:
- Login form centered card
- Admin table styling
- Form styling matching Botanical theme

- [ ] **Step 6: Commit**

```bash
git add public/login.html public/admin.html src/js/api.js src/css/styles.css src/server/app.js
git commit -m "feat: add login page, admin page, and cookie-based API client"
```

---

## Task 8: Seed Script, Startup Integration, Test Migration

**Files:**
- Create: `scripts/seed-admin.js`
- Modify: `server.js`
- Modify: `tests/server.test.js`

- [ ] **Step 1: Create seed-admin.js**

Create `scripts/seed-admin.js`:

```javascript
const { createUser, findByUsername } = require('../src/server/services/user-service');
const { close } = require('../src/server/storage/db');
const { migrate } = require('./migrate');

async function seedAdmin() {
    const args = process.argv.slice(2);
    const usernameIdx = args.indexOf('--username');
    const passwordIdx = args.indexOf('--password');

    if (usernameIdx === -1 || passwordIdx === -1) {
        console.error('Usage: npm run seed-admin -- --username <name> --password <pass>');
        process.exit(1);
    }

    const username = args[usernameIdx + 1];
    const password = args[passwordIdx + 1];

    if (!username || !password) {
        console.error('Username and password are required');
        process.exit(1);
    }

    await migrate();

    const existing = await findByUsername(username);
    if (existing) {
        console.error(`User "${username}" already exists`);
        process.exit(1);
    }

    const user = await createUser(username, password, 'admin');
    console.log(`Admin user "${user.username}" created (id: ${user.id})`);
    await close();
}

seedAdmin().catch(err => {
    console.error('Seed failed:', err.message);
    close();
    process.exit(1);
});
```

- [ ] **Step 2: Update server.js to run migration on startup**

Add migration call before `app.listen` in `server.js`:

```javascript
const { migrate } = require('./scripts/migrate');

if (require.main === module) {
    migrate().then(() => {
        const server = app.listen(PORT, () => {
            // ... existing startup logging
        });
        // ... existing shutdown handlers
    }).catch(err => {
        logger.error({ err: err.message }, 'Migration failed, cannot start');
        process.exit(1);
    });
}
```

- [ ] **Step 3: Update test setup**

In `tests/server.test.js`, update `beforeEach` to truncate PostgreSQL tables instead of writing empty JSON files:

```javascript
const { query } = require('../src/server/storage/db');
const { migrate } = require('../scripts/migrate');

beforeAll(async () => {
    await migrate();
});

beforeEach(async () => {
    await query('DELETE FROM tasks');
    await query('DELETE FROM users');
});
```

Remove `resetCaches()` calls and `fs.writeFileSync` for JSON files. The tests themselves should work as-is since the API interface hasn't changed.

Set test environment to use a separate database:
```
DATABASE_URL=postgres://gartenplaner:gartenplaner@localhost:5432/gartenplaner_test
```

- [ ] **Step 4: Run full test suite**

```bash
npx jest --verbose --forceExit --detectOpenHandles
```

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-admin.js server.js tests/server.test.js
git commit -m "feat: add seed-admin script, startup migration, and test DB setup"
```

---

## Execution Order

Tasks must be executed sequentially — each builds on the previous:

```
Task 1 (Docker + Deps) → Task 2 (DB + Migration) → Task 3 (Postgres Store)
  → Task 4 (User Service) → Task 5 (JWT Auth) → Task 6 (Admin API)
  → Task 7 (Frontend) → Task 8 (Seed + Tests)
```

## Done Criteria

- [ ] `docker compose up` starts both app and PostgreSQL
- [ ] Existing tasks.json imported into DB on first run
- [ ] Login page works with username/password
- [ ] JWT in HttpOnly cookie, 24h expiry
- [ ] Admin can create/edit/delete users
- [ ] All API endpoints work under `/api/v1`
- [ ] Tests pass against PostgreSQL test database
- [ ] `npm run seed-admin` creates initial admin user
