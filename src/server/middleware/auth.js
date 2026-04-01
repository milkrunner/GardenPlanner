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
    if (req.path === '/auth/status' || req.path === '/auth/login') {
        return next();
    }
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
