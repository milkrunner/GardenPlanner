const rateLimit = require('express-rate-limit');
const { MemoryStore, ipKeyGenerator } = require('express-rate-limit');

// --- Rate limit configuration ---
const RATE_LIMITS = {
    general: { windowMs: 15 * 60 * 1000, max: 100 },   // 100 req / 15 min
    write:   { windowMs: 15 * 60 * 1000, max: 30 },     // 30 req / 15 min
    auth:    { windowMs: 15 * 60 * 1000, max: 10 }       // 10 req / 15 min
};

const COMMON_OPTIONS = {
    standardHeaders: true,
    legacyHeaders: false
};

// Key generator: use API key if present, fall back to IP (IPv6-safe via ipKeyGenerator)
function keyGenerator(req) {
    return req.headers['x-api-key'] || ipKeyGenerator(req.ip);
}

// Explicit stores so we can reset them in tests
const generalStore = new MemoryStore();
const writeStore = new MemoryStore();
const authStore = new MemoryStore();

const generalLimiter = rateLimit({
    ...COMMON_OPTIONS,
    ...RATE_LIMITS.general,
    keyGenerator,
    store: generalStore
});

const writeLimiter = rateLimit({
    ...COMMON_OPTIONS,
    ...RATE_LIMITS.write,
    keyGenerator,
    store: writeStore
});

const authLimiter = rateLimit({
    ...COMMON_OPTIONS,
    ...RATE_LIMITS.auth,
    store: authStore
    // Auth limiter always uses IP (no key yet)
});

// Reset all rate limiter stores (useful for tests)
function resetRateLimitStores() {
    generalStore.resetAll();
    writeStore.resetAll();
    authStore.resetAll();
}

module.exports = { generalLimiter, writeLimiter, authLimiter, RATE_LIMITS, resetRateLimitStores };
