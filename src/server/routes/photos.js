/**
 * @module routes/photos
 * Express router for photo upload, serving, and deletion.
 * - POST /api/v1/tasks/:id/photos - Upload photo(s) for a task
 * - GET  /api/v1/photos/:filename - Serve a photo file
 * - GET  /api/v1/photos/:filename/thumb - Serve a thumbnail
 * - DELETE /api/v1/tasks/:id/photos/:filename - Remove a photo from a task
 */

const express = require('express');
const multer = require('multer');
const { validateIdParam } = require('../validation/task-validator');
const store = require('../storage/postgres-store');
const { audit } = require('../logger');
const {
    ALLOWED_MIMETYPES,
    MAX_FILE_SIZE,
    MAX_PHOTOS_PER_TASK,
    savePhoto,
    deletePhoto,
    getPhotoPath,
    getThumbPath,
} = require('../services/photo-service');

const router = express.Router();

// --- Multer configuration: memory storage for processing before writing ---
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter(req, file) {
        if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
            throw new Error('Nur Bilddateien erlaubt (jpg, png, gif, webp)');
        }
    },
});

/**
 * POST /tasks/:id/photos - Upload one or more photos for a task.
 * Accepts multipart/form-data with field name "photos".
 */
router.post('/tasks/:id/photos', validateIdParam, upload.array('photos', MAX_PHOTOS_PER_TASK), async (req, res) => {
    const task = await store.getTaskById(req.params.id);
    if (!task) {
        return res.status(404).json({ error: true, status: 404, message: 'Task not found' });
    }

    const currentPhotos = Array.isArray(task.photos) ? task.photos : [];
    const remaining = MAX_PHOTOS_PER_TASK - currentPhotos.length;

    if (remaining <= 0) {
        return res.status(400).json({
            error: true,
            status: 400,
            message: `Maximal ${MAX_PHOTOS_PER_TASK} Fotos erlaubt. Keine weiteren moeglich.`,
        });
    }

    const files = req.files || [];
    if (files.length === 0) {
        return res.status(400).json({ error: true, status: 400, message: 'Keine Dateien hochgeladen' });
    }

    const toProcess = files.slice(0, remaining);
    const savedFilenames = [];

    for (const file of toProcess) {
        const filename = await savePhoto(file.buffer, file.mimetype);
        savedFilenames.push(filename);
    }

    const updatedPhotos = [...currentPhotos, ...savedFilenames];
    await store.updateTask(req.params.id, { photos: updatedPhotos });

    audit('photos_uploaded', { taskId: req.params.id, count: savedFilenames.length, filenames: savedFilenames });

    res.status(201).json({
        photos: updatedPhotos,
        uploaded: savedFilenames,
    });
});

/**
 * GET /photos/:filename - Serve a full-size photo.
 */
router.get('/photos/:filename', (req, res) => {
    const filePath = getPhotoPath(req.params.filename);
    if (!filePath) {
        return res.status(404).json({ error: true, status: 404, message: 'Foto nicht gefunden' });
    }
    res.sendFile(filePath);
});

/**
 * GET /photos/:filename/thumb - Serve a thumbnail.
 */
router.get('/photos/:filename/thumb', (req, res) => {
    const filePath = getThumbPath(req.params.filename);
    if (!filePath) {
        return res.status(404).json({ error: true, status: 404, message: 'Thumbnail nicht gefunden' });
    }
    res.sendFile(filePath);
});

/**
 * DELETE /tasks/:id/photos/:filename - Remove a photo from a task.
 */
router.delete('/tasks/:id/photos/:filename', validateIdParam, async (req, res) => {
    const task = await store.getTaskById(req.params.id);
    if (!task) {
        return res.status(404).json({ error: true, status: 404, message: 'Task not found' });
    }

    const currentPhotos = Array.isArray(task.photos) ? task.photos : [];
    const filename = req.params.filename;

    if (!currentPhotos.includes(filename)) {
        return res.status(404).json({ error: true, status: 404, message: 'Foto nicht in dieser Aufgabe' });
    }

    // Delete file from disk
    deletePhoto(filename);

    // Remove from task's photo list
    const updatedPhotos = currentPhotos.filter(p => p !== filename);
    await store.updateTask(req.params.id, { photos: updatedPhotos });

    audit('photo_deleted', { taskId: req.params.id, filename });

    res.status(200).json({ photos: updatedPhotos });
});

// --- Multer error handler ---
router.use((err, req, res, _next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: true, status: 400, message: 'Datei zu gross (max. 5 MB)' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: true, status: 400, message: 'Zu viele Dateien' });
        }
        return res.status(400).json({ error: true, status: 400, message: err.message });
    }
    if (err && err.message && err.message.includes('Nur Bilddateien')) {
        return res.status(400).json({ error: true, status: 400, message: err.message });
    }
    _next(err);
});

module.exports = router;
