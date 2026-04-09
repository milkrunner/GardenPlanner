/**
 * @module config
 * Central configuration constants for the GardenPlanner server.
 * Replaces magic numbers scattered across server modules (#145).
 */

/**
 * @typedef {Object} PaginationConfig
 * @property {number} MAX_LIMIT - Maximum items per page (200)
 * @property {number} DEFAULT_LIMIT - Default items per page (50)
 */

/** @type {PaginationConfig} */
const PAGINATION = {
    MAX_LIMIT: 200,
    DEFAULT_LIMIT: 50,
};

/**
 * @typedef {Object} FieldLimitsConfig
 * @property {number} TITLE_MAX - Max characters for task title
 * @property {number} EMPLOYEE_MAX - Max characters for employee name
 * @property {number} LOCATION_MAX - Max characters for location
 * @property {number} DESCRIPTION_MAX - Max characters for description
 * @property {number} NOTES_MAX - Max characters for notes
 * @property {number} MAX_SUBTASKS - Max number of subtasks per task
 * @property {number} SUBTASK_TEXT_MAX - Max characters for subtask text
 */

/** @type {FieldLimitsConfig} */
const FIELD_LIMITS = {
    TITLE_MAX: 200,
    EMPLOYEE_MAX: 100,
    LOCATION_MAX: 100,
    DESCRIPTION_MAX: 2000,
    NOTES_MAX: 5000,
    MAX_SUBTASKS: 50,
    SUBTASK_TEXT_MAX: 500,
};

/**
 * @typedef {Object} StorageConfig
 * @property {number} LOCK_TIMEOUT_MS - Max wait time for file lock acquisition
 * @property {number} LOCK_POLL_INTERVAL_MS - Interval between lock retry attempts
 * @property {number} WRITE_MAX_RETRIES - Max retries for atomic file rename
 * @property {number} WRITE_RETRY_DELAY_MS - Delay between write retries
 */

/** @type {StorageConfig} */
const STORAGE = {
    LOCK_TIMEOUT_MS: 5000,
    LOCK_POLL_INTERVAL_MS: 10,
    WRITE_MAX_RETRIES: 3,
    WRITE_RETRY_DELAY_MS: 50,
};

/**
 * @typedef {Object} PhotoConfig
 * @property {number} MAX_FILE_SIZE - Max file size in bytes (5 MB)
 * @property {number} MAX_PHOTOS_PER_TASK - Max photos per task
 * @property {number} THUMB_WIDTH - Thumbnail width in pixels
 * @property {number} THUMB_HEIGHT - Thumbnail height in pixels
 */

/** @type {PhotoConfig} */
const PHOTOS = {
    MAX_FILE_SIZE: 5 * 1024 * 1024,
    MAX_PHOTOS_PER_TASK: 3,
    THUMB_WIDTH: 200,
    THUMB_HEIGHT: 200,
};

module.exports = { PAGINATION, FIELD_LIMITS, STORAGE, PHOTOS };
