const express = require('express');
const router = express.Router();
const TaskController = require('../controllers/taskController');

/**
 * @swagger
 * components:
 * schemas:
 * Task:
 * type: object
 * required:
 * - title
 * properties:
 * id:
 * type: integer
 * description: The auto-generated id of the task
 * title:
 * type: string
 * description: The task title
 * status:
 * type: string
 * enum: [PENDING, IN_PROGRESS, COMPLETED]
 * due_date:
 * type: string
 * format: date-time
 */

/**
 * @swagger
 * /api/tasks:
 * get:
 * summary: Returns the list of all tasks
 * responses:
 * 200:
 * description: The list of tasks
 * content:
 * application/json:
 * schema:
 * type: array
 * items:
 * $ref: '#/components/schemas/Task'
 * post:
 * summary: Create a new task
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * $ref: '#/components/schemas/Task'
 * responses:
 * 201:
 * description: The task was successfully created
 * 400:
 * description: Validation error
 */
router.get('/', TaskController.getAllTasks);
router.post('/', TaskController.createTask);

/**
 * @swagger
 * /api/tasks/{id}:
 * get:
 * summary: Get a task by ID
 * parameters:
 * - in: path
 * name: id
 * schema:
 * type: integer
 * required: true
 * description: The task ID
 * responses:
 * 200:
 * description: The task description
 * 404:
 * description: Task not found
 */
router.get('/:id', TaskController.getTaskById);

// Update and Delete routes
router.put('/:id', TaskController.updateTask);
router.delete('/:id', TaskController.deleteTask);

module.exports = router;