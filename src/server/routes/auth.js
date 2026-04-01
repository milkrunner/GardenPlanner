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
