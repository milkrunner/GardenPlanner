// Security headers (#2 CORS removed - same-origin, #8 CSP added)
function securityHeaders(req, res, next) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; '));
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
}

module.exports = { securityHeaders };
