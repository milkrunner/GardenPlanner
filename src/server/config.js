// Startup configuration checks. Kept free of side effects so it can be unit-tested.
const net = require('node:net');

// Reverse proxy support (#334): value for Express' `trust proxy` setting from TRUST_PROXY.
// Unset, empty, `false` and `0` keep it off (safe default: client address = socket address).
// Accepted: `true` (trust every hop, only behind a proxy that overwrites X-Forwarded-For and a
// server that is not directly reachable), a hop count (`1`, `2`, ...), or a comma-separated list of
// the Express keywords `loopback`, `linklocal`, `uniquelocal` and IPv4/IPv6 addresses or CIDR
// subnets. Anything else is a configuration error; app.js then falls back to "off".
const TRUST_PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isTrustedAddress(entry) {
    const [address, prefix, ...rest] = entry.split('/');
    const family = net.isIP(address);
    if (!family || rest.length > 0) return false;
    if (prefix === undefined) return true;
    if (!/^\d{1,3}$/.test(prefix)) return false;
    return Number(prefix) <= (family === 4 ? 32 : 128);
}

function parseTrustProxy(raw) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    const lower = value.toLowerCase();
    if (value === '' || lower === 'false' || value === '0') return { ok: true, value: false };
    if (lower === 'true') {
        return {
            ok: true,
            value: true,
            warning:
                'TRUST_PROXY=true trusts every X-Forwarded-For hop. Only use it behind a reverse proxy ' +
                'that overwrites the header and when the server is not directly reachable; otherwise ' +
                'clients can spoof their address and bypass the rate limit. Prefer a hop count or subnet list.',
        };
    }
    if (/^\d+$/.test(value)) {
        const hops = Number(value);
        if (Number.isSafeInteger(hops) && hops <= 32) return { ok: true, value: hops };
    } else {
        const entries = value.split(',').map((entry) => entry.trim());
        if (entries.every((entry) => TRUST_PROXY_KEYWORDS.has(entry.toLowerCase()) || isTrustedAddress(entry))) {
            return {
                ok: true,
                value: entries.map((entry) =>
                    TRUST_PROXY_KEYWORDS.has(entry.toLowerCase()) ? entry.toLowerCase() : entry,
                ),
            };
        }
    }
    return {
        ok: false,
        value: false,
        error:
            `Invalid TRUST_PROXY value "${value}". Use true, false, a hop count (e.g. 1), or a comma-separated ` +
            'list of loopback, linklocal, uniquelocal, IP addresses or CIDR subnets.',
    };
}

// Production without API_KEY would expose the full API unauthenticated. Refuse to start unless the
// operator explicitly opts out with ALLOW_UNAUTHENTICATED=true (e.g. behind a trusted gateway).
// An invalid TRUST_PROXY also refuses to start (a typo must not silently degrade rate limiting).
function checkStartupConfig(env = process.env) {
    const result = checkAuthConfig(env);
    const proxy = parseTrustProxy(env.TRUST_PROXY);
    if (!proxy.ok) return { ...result, ok: false, error: result.ok ? proxy.error : `${result.error} ${proxy.error}` };
    if (proxy.warning)
        return { ...result, warning: result.warning ? `${result.warning} ${proxy.warning}` : proxy.warning };
    return result;
}

function checkAuthConfig(env) {
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

module.exports = { checkStartupConfig, parseTrustProxy };
