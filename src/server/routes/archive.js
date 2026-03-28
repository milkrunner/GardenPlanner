const express = require('express');
const router = express.Router();
const { validateIdParam } = require('../validation/task-validator');
const {
    archiveTask,
    unarchiveTask,
    listArchivedTasks,
    deleteArchivedTask
} = require('../services/task-service');

// POST /api/tasks/:id/archive - Archive a task
router.post('/tasks/:id/archive', validateIdParam, async (req, res) => {
    const result = await archiveTask(req.params.id);
    if (result.error) {
        return res.status(result.status).json({ error: result.message });
    }
    res.json(result.task);
});

// POST /api/tasks/:id/unarchive - Restore a task from archive
router.post('/tasks/:id/unarchive', validateIdParam, async (req, res) => {
    const result = await unarchiveTask(req.params.id);
    if (result.error) {
        return res.status(result.status).json({ error: result.message });
    }
    res.json(result.task);
});

// GET /api/archived-tasks - List archived tasks
router.get('/archived-tasks', (req, res) => {
    res.json(listArchivedTasks());
});

// DELETE /api/archived-tasks/:id - Delete an archived task permanently
router.delete('/archived-tasks/:id', validateIdParam, async (req, res) => {
    const result = await deleteArchivedTask(req.params.id);
    if (result.error) {
        return res.status(result.status).json({ error: result.message });
    }
    res.status(204).send();
});

module.exports = router;
