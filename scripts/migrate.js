const { query, close } = require('../src/server/storage/db');
const fs = require('fs');
const path = require('path');

const TASKS_FILE = path.join(__dirname, '..', 'data', 'tasks.json');
const ARCHIVED_FILE = path.join(__dirname, '..', 'data', 'archived-tasks.json');

async function migrate() {
    console.log('Running database migration...');

    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL environment variable is not set. Cannot connect to PostgreSQL.');
    }

    // Test connection first
    try {
        await query('SELECT 1');
    } catch (err) {
        throw new Error(`Cannot connect to PostgreSQL at ${process.env.DATABASE_URL}: ${err.message}`);
    }

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
            photos JSONB DEFAULT '[]',
            sort_order BIGINT DEFAULT extract(epoch from now()) * 1000,
            completed_at TIMESTAMPTZ,
            archived_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    // Add photos column if it doesn't exist (for existing databases)
    await query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'tasks' AND column_name = 'photos'
            ) THEN
                ALTER TABLE tasks ADD COLUMN photos JSONB DEFAULT '[]';
            END IF;
        END $$
    `);

    // Add dependencies column if it doesn't exist (#242)
    await query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'tasks' AND column_name = 'dependencies'
            ) THEN
                ALTER TABLE tasks ADD COLUMN dependencies JSONB DEFAULT '[]';
            END IF;
        END $$
    `);

    console.log('Tables created.');

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
