/**
 * @module services/photo-service
 * File-based photo storage: upload, thumbnail generation, serving, and deletion.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { logger } = require('../logger');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', '..', 'data');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
const THUMBS_DIR = path.join(PHOTOS_DIR, 'thumbs');

const THUMB_WIDTH = 200;
const THUMB_HEIGHT = 200;

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_PHOTOS_PER_TASK = 3;

/**
 * Ensure photo directories exist.
 */
function ensureDirectories() {
    if (!fs.existsSync(PHOTOS_DIR)) {
        fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    }
    if (!fs.existsSync(THUMBS_DIR)) {
        fs.mkdirSync(THUMBS_DIR, { recursive: true });
    }
}

// Create directories on module load
ensureDirectories();

/**
 * Map mimetype to file extension.
 * @param {string} mimetype
 * @returns {string} file extension with dot
 */
function mimeToExt(mimetype) {
    const map = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
    };
    return map[mimetype] || '.jpg';
}

/**
 * Generate a unique filename for a photo.
 * @param {string} mimetype
 * @returns {string} unique filename
 */
function generateFilename(mimetype) {
    return uuidv4() + mimeToExt(mimetype);
}

/**
 * Create a thumbnail for a given photo file.
 * @param {string} filename - The photo filename
 * @returns {Promise<void>}
 */
async function createThumbnail(filename) {
    const inputPath = path.join(PHOTOS_DIR, filename);
    const outputPath = path.join(THUMBS_DIR, filename);

    try {
        await sharp(inputPath)
            .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover' })
            .toFile(outputPath);
    } catch (err) {
        logger.error({ err: err.message, filename }, 'Failed to create thumbnail');
        // Don't throw - thumbnail generation failure shouldn't block upload
    }
}

/**
 * Save an uploaded file buffer to disk and generate a thumbnail.
 * @param {Buffer} buffer - File contents
 * @param {string} mimetype - MIME type of the file
 * @returns {Promise<string>} The generated filename
 */
async function savePhoto(buffer, mimetype) {
    const filename = generateFilename(mimetype);
    const filePath = path.join(PHOTOS_DIR, filename);

    fs.writeFileSync(filePath, buffer);
    await createThumbnail(filename);

    logger.info({ filename, size: buffer.length }, 'Photo saved');
    return filename;
}

/**
 * Save a Base64 data URL as a file and generate a thumbnail.
 * Used by the migration script and backwards-compatible create/update.
 * @param {string} dataUrl - Base64 data URL (data:image/...;base64,...)
 * @returns {Promise<string|null>} The generated filename or null on error
 */
async function saveBase64Photo(dataUrl) {
    try {
        const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) return null;

        const mimetype = match[1];
        if (!ALLOWED_MIMETYPES.includes(mimetype)) return null;

        const buffer = Buffer.from(match[2], 'base64');
        return await savePhoto(buffer, mimetype);
    } catch (err) {
        logger.error({ err: err.message }, 'Failed to save Base64 photo');
        return null;
    }
}

/**
 * Delete a photo and its thumbnail from disk.
 * @param {string} filename
 * @returns {boolean} true if file was deleted
 */
function deletePhoto(filename) {
    // Sanitize: only allow simple filenames (no path traversal)
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return false;
    }

    const filePath = path.join(PHOTOS_DIR, filename);
    const thumbPath = path.join(THUMBS_DIR, filename);

    let deleted = false;
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted = true;
    }
    if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath);
    }

    if (deleted) {
        logger.info({ filename }, 'Photo deleted');
    }
    return deleted;
}

/**
 * Get the full filesystem path for a photo.
 * @param {string} filename
 * @returns {string|null} Full path or null if not found
 */
function getPhotoPath(filename) {
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return null;
    }
    const filePath = path.join(PHOTOS_DIR, filename);
    return fs.existsSync(filePath) ? filePath : null;
}

/**
 * Get the full filesystem path for a thumbnail.
 * Falls back to the original photo if thumbnail doesn't exist.
 * @param {string} filename
 * @returns {string|null} Full path or null if not found
 */
function getThumbPath(filename) {
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return null;
    }
    const thumbPath = path.join(THUMBS_DIR, filename);
    if (fs.existsSync(thumbPath)) return thumbPath;

    // Fallback to original
    const filePath = path.join(PHOTOS_DIR, filename);
    return fs.existsSync(filePath) ? filePath : null;
}

module.exports = {
    PHOTOS_DIR,
    THUMBS_DIR,
    ALLOWED_MIMETYPES,
    MAX_FILE_SIZE,
    MAX_PHOTOS_PER_TASK,
    ensureDirectories,
    savePhoto,
    saveBase64Photo,
    deletePhoto,
    getPhotoPath,
    getThumbPath,
};
