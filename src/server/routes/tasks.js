const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/async-handler');
const { validateIdParam } = require('../validation/task-validator');
const { listTasks, searchTasks, getTask, createTask, updateTask, deleteTask } = require('../services/task-service');

// GET /api/tasks - List tasks with optional pagination (?page=1&limit=50)
// Filters on personal names are deliberately not accepted on GET: query strings end up in request logs,
// so they go through POST /api/tasks/search. The names are only checked, never read, and rejected
// instead of silently ignored.
const BODY_ONLY_FILTERS = ['employee', 'location'];

router.get('/', (req, res) => {
    if (Object.keys(req.query).some((name) => BODY_ONLY_FILTERS.includes(name))) {
        return res.status(400).json({
            error: 'Filters employee and location are not supported on GET /api/tasks. Use POST /api/tasks/search.',
        });
    }
    res.json(listTasks(req.query));
});

// POST /api/tasks/search - Filter tasks with sensitive criteria via request body
router.post('/search', (req, res) => {
    res.json(searchTasks(req.body));
});

// GET /api/tasks/:id - Get single task
router.get('/:id', validateIdParam, (req, res) => {
    const task = getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
});

// POST /api/tasks - Create a new task
router.post(
    '/',
    asyncHandler(async (req, res) => {
        const result = await createTask(req.body);
        if (result.error) {
            return res.status(result.status).json({ errors: result.errors });
        }
        res.status(201).json(result.task);
    }),
);

// PUT /api/tasks/:id - Update a task
router.put(
    '/:id',
    validateIdParam,
    asyncHandler(async (req, res) => {
        const result = await updateTask(req.params.id, req.body);
        if (result.error) {
            if (result.status === 400) return res.status(400).json({ errors: result.errors });
            return res.status(result.status).json({ error: result.message });
        }
        res.json(result.task);
    }),
);

// DELETE /api/tasks/:id - Delete a task
router.delete(
    '/:id',
    validateIdParam,
    asyncHandler(async (req, res) => {
        const result = await deleteTask(req.params.id);
        if (result.error) {
            return res.status(result.status).json({ error: result.message });
        }
        res.status(204).send();
    }),
);

module.exports = router;
