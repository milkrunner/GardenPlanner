// Express 4 does not catch rejected promises of async route handlers. Without this wrapper a
// storage/lock failure becomes an unhandled rejection (process crash) instead of a 500 response.
function asyncHandler(handler) {
    return function wrappedAsyncHandler(req, res, next) {
        Promise.resolve()
            .then(() => handler(req, res, next))
            .catch(next);
    };
}

module.exports = { asyncHandler };
