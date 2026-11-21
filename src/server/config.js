// Startup configuration checks. Kept free of side effects so it can be unit-tested.

// Production without API_KEY would expose the full API unauthenticated. Refuse to start unless the
// operator explicitly opts out with ALLOW_UNAUTHENTICATED=true (e.g. behind a trusted gateway).
function checkStartupConfig(env = process.env) {
    const authEnabled = !!env.API_KEY;
    const production = env.NODE_ENV === 'production';
    const optOut = env.ALLOW_UNAUTHENTICATED === 'true';

    if (authEnabled) return { ok: true, authEnabled, warning: null };

    if (production && !optOut) {
        return {
            ok: false,
            authEnabled,
            error:
                'API_KEY is not set while NODE_ENV=production. Refusing to start an unauthenticated API. ' +
                'Set API_KEY to a secret value, or set ALLOW_UNAUTHENTICATED=true to run without ' +
                'authentication deliberately (only behind a trusted network or gateway).',
        };
    }

    return {
        ok: true,
        authEnabled,
        warning: production
            ? 'ALLOW_UNAUTHENTICATED=true: API runs WITHOUT authentication in production.'
            : 'No API_KEY set. API is open for all requests.',
    };
}

module.exports = { checkStartupConfig };
