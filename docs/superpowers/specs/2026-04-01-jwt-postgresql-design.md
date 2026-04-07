# JWT Authentication + PostgreSQL Migration Design

> Generated: 2026-04-01 | Status: Approved
> Scope: #137 (JWT Auth) + #142 (PostgreSQL) — Big Bang Migration

---

## Overview

Replace JSON file storage with PostgreSQL and implement JWT-based multi-user authentication in a single migration. Docker Compose orchestrates both services.

| Aspect | Before | After |
|--------|--------|-------|
| Storage | JSON files (tasks.json, archived-tasks.json) | PostgreSQL 16 |
| Auth | Optional API-Key in env, stored in localStorage | JWT in HttpOnly Cookie, bcrypt passwords |
| Users | None | Multi-user with admin/user roles |
| Archiving | Separate file (archived-tasks.json) | Same table, `archived_at IS NOT NULL` |

---

## Database Schema

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
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
);
```

No separate archived_tasks table — `archived_at IS NOT NULL` serves as the filter. Subtasks and history remain JSONB for flexibility.

---

## Docker Compose

```yaml
services:
  gartenplaner:
    build: .
    ports:
      - "8080:3000"
    environment:
      - DATABASE_URL=postgres://gartenplaner:${DB_PASSWORD}@db:5432/gartenplaner
      - JWT_SECRET=${JWT_SECRET}
      - NODE_ENV=production
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=gartenplaner
      - POSTGRES_USER=gartenplaner
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gartenplaner"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  db-data:
```

---

## New Dependencies

- `pg` — PostgreSQL client (raw SQL, parameterized queries, no ORM)
- `bcrypt` — password hashing
- `jsonwebtoken` — JWT sign/verify

---

## Auth Flow

### JWT Configuration
- Algorithm: HS256
- Expiry: 24 hours
- Storage: HttpOnly Cookie (`token`), Secure, SameSite=Strict
- No refresh tokens — re-login after 24h

### Endpoints

**Login:**
```
POST /api/v1/auth/login
Body: { "username", "password" }
Response: 200 { "user": { "id", "username", "role" } }
+ Set-Cookie: token=<JWT>; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
```

**Logout:**
```
POST /api/v1/auth/logout
Response: 200 { "message": "Logged out" }
+ Set-Cookie: token=; Max-Age=0
```

**Auth Status (extended):**
```
GET /api/v1/auth/status
Response: 200 { "authRequired": true, "user": { "id", "username", "role" } | null }
```

**Admin — User Management:**
```
GET    /api/v1/admin/users      — List all users
POST   /api/v1/admin/users      — Create user
PUT    /api/v1/admin/users/:id  — Update user (password, role)
DELETE /api/v1/admin/users/:id  — Delete user
```

### Middleware
- `auth.js` replaced: reads JWT from cookie, verifies, sets `req.user`
- New `requireAdmin` middleware for `/api/v1/admin/*`
- If `JWT_SECRET` not set: auth completely disabled (backwards compatible)

---

## Storage Layer

### New: `src/server/storage/postgres-store.js`

Same function signatures as json-store.js — drop-in replacement:

```javascript
async function readTasks()           // SELECT ... WHERE archived_at IS NULL
async function readArchivedTasks()   // SELECT ... WHERE archived_at IS NOT NULL
async function createTask(task)      // INSERT INTO tasks ...
async function updateTask(id, data)  // UPDATE tasks SET ... WHERE id = $1
async function deleteTask(id)        // DELETE FROM tasks WHERE id = $1
async function archiveTask(id)       // UPDATE tasks SET archived_at = NOW()
async function unarchiveTask(id)     // UPDATE tasks SET archived_at = NULL
```

### Removed
- `json-store.js` — file locking, in-memory cache, JSON read/write
- `data/tasks.json`, `data/archived-tasks.json`

### Service Layer
- `task-service.js` simplified — CRUD moves to SQL, validation and business logic (history tracking) remain
- All methods async (partially already)

---

## Frontend Changes

### New Pages
- `public/login.html` — username/password form, redirects to dashboard on success
- `public/admin.html` — user management table (create, edit role, delete users)

### Modified
- `src/js/api.js` — remove localStorage API-Key logic, cookies sent automatically
- All pages — redirect to `/login` if `/api/v1/auth/status` returns `user: null`
- Navigation — add admin link (visible only for admin role)

---

## Scripts

### `scripts/migrate.js`
- Runs on app startup
- Creates tables if they don't exist (idempotent)
- Checks for `data/tasks.json` — if exists, imports tasks into DB (one-time migration)
- Logs migration status

### `scripts/seed-admin.js`
- Creates initial admin user
- Usage: `npm run seed-admin -- --username admin --password <password>`
- Errors if admin already exists

---

## Backup (#143)

With PostgreSQL in place, backup becomes trivial:
- `pg_dump` via cron or Docker healthcheck
- Document the `docker exec db pg_dump` command in README
- Not implemented as code in this PR — just documented

---

## Testing

- Existing tests need PostgreSQL test database
- `beforeEach`: truncate tables instead of writing empty JSON
- New tests for auth endpoints (login, logout, status, admin CRUD)
- Test environment uses separate `gartenplaner_test` database

---

## Migration Path

1. User runs `docker compose up` — PostgreSQL starts, app connects
2. `migrate.js` creates tables, imports existing tasks.json if found
3. User runs `npm run seed-admin` to create first admin
4. Old `API_KEY` env var ignored when `JWT_SECRET` is set
5. `data/tasks.json` kept as backup, not deleted automatically
