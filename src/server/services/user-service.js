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
