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
