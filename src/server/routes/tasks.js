/**
 * @module routes/tasks
 * Express router for task CRUD endpoints under /api/tasks.
 * Supports listing, searching, creating, updating, and deleting tasks.
 */

const express = require('express');
const router = express.Router();
const { validateIdParam } = require('../validation/task-validator');
const {
    listTasks,
    searchTasks,
    getTask,
    createTask,
    updateTask,
    deleteTask
} = require('../services/task-service');

// GET /api/tasks - List tasks with optional pagination (?page=1&limit=50)
router.get('/', (req, res) => {
    res.json(listTasks(req.query));
});

// POST /api/tasks/search - Filter tasks with sensitive criteria via request body
router.post('/search', (req, res) => {
    res.json(searchTasks(req.body));
});

// GET /api/tasks/:id - Get single task
router.get('/:id', validateIdParam, (req, res) => {
    const task = getTask(req.params.id);
    if (!task) return res.status(404).json({ error: true, status: 404, message: 'Task not found' });
    res.json(task);
});

// POST /api/tasks - Create a new task
router.post('/', async (req, res) => {
    const result = await createTask(req.body);
    if (result.error) {
        return res.status(result.status).json({ error: true, status: result.status, message: 'Validation failed', errors: result.errors });
    }
    res.status(201).json(result.task);
});

// PUT /api/tasks/:id - Update a task
router.put('/:id', validateIdParam, async (req, res) => {
    const result = await updateTask(req.params.id, req.body);
    if (result.error) {
        if (result.status === 400) return res.status(400).json({ error: true, status: 400, message: 'Validation failed', errors: result.errors });
        return res.status(result.status).json({ error: true, status: result.status, message: result.message });
    }
    res.json(result.task);
});

// DELETE /api/tasks/:id - Delete a task
router.delete('/:id', validateIdParam, async (req, res) => {
    const result = await deleteTask(req.params.id);
    if (result.error) {
        return res.status(result.status).json({ error: true, status: result.status, message: result.message });
    }
    res.status(204).send();
});

module.exports = router;
