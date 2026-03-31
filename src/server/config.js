// --- Central configuration constants ---
// Replaces magic numbers scattered across server modules (#145)

const PAGINATION = {
    MAX_LIMIT: 200,
    DEFAULT_LIMIT: 50,
};

const FIELD_LIMITS = {
    TITLE_MAX: 200,
    EMPLOYEE_MAX: 100,
    LOCATION_MAX: 100,
    DESCRIPTION_MAX: 2000,
    NOTES_MAX: 5000,
    MAX_SUBTASKS: 50,
    SUBTASK_TEXT_MAX: 500,
};

const STORAGE = {
    LOCK_TIMEOUT_MS: 5000,
    LOCK_POLL_INTERVAL_MS: 10,
    WRITE_MAX_RETRIES: 3,
    WRITE_RETRY_DELAY_MS: 50,
};

module.exports = { PAGINATION, FIELD_LIMITS, STORAGE };
