const express = require('express');
const router = express.Router();
const TaskController = require('../controllers/taskController');

/**
 * @swagger
 * components:
 *   schemas:
 *     Task:
 *       type: object
 *       required:
 *         - title
 *         - due_date
 *       properties:
 *         id:
 *           type: integer
 *           description: Auto-generated task ID
 *           readOnly: true
 *         title:
 *           type: string
 *           description: The task title
 *         description:
 *           type: string
 *           description: Optional task description
 *         status:
 *           type: string
 *           enum: [PENDING, IN_PROGRESS, COMPLETED]
 *           description: Task status
 *         due_date:
 *           type: string
 *           format: date-time
 *           description: Task due date
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Task creation timestamp
 *           readOnly: true
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *           readOnly: true
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           description: Soft delete timestamp
 *           readOnly: true
 */


/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Returns a list of all tasks
 *     description: Retrieve tasks with optional filters and sorting.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, IN_PROGRESS, COMPLETED]
 *         description: Filter tasks by status
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include soft-deleted tasks
 *       - in: query
 *         name: dueBefore
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Return tasks with due_date before this value
 *       - in: query
 *         name: dueAfter
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Return tasks with due_date after this value
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of tasks to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of tasks to skip
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [created_at, due_date, updated_at]
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: The list of tasks
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 *   post:
 *     summary: Create a new task
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Task'
 *     responses:
 *       201:
 *         description: Task successfully created
 *       400:
 *         description: Validation error
 */

router.get('/', TaskController.getAllTasks);
router.post('/', TaskController.createTask);

/**
 * @swagger
 * /api/tasks/{id}:
 *   get:
 *     summary: Get a task by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The task ID
 *     responses:
 *       200:
 *         description: Task data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       404:
 *         description: Task not found
 *   put:
 *     summary: Update a task by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The task ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Task'
 *     responses:
 *       200:
 *         description: Task updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Task not found
 *   delete:
 *     summary: Soft delete a task
 *     description: Marks a task as deleted by setting deleted_at and logs an audit entry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The task ID
 *     responses:
 *       204:
 *         description: Task successfully deleted
 *       404:
 *         description: Task not found
 *       500:
 *         description: Internal server error
 */

router.get('/:id', TaskController.getTaskById);
router.put('/:id', TaskController.updateTask);
router.delete('/:id', TaskController.deleteTask);

/**
 * @swagger
 * /api/tasks/{id}/history:
 *   get:
 *     summary: Get audit history for a task
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The task ID
 *     responses:
 *       200:
 *         description: List of task history events
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   task_id:
 *                     type: integer
 *                   change_summary:
 *                     type: string
 *                   changed_at:
 *                     type: string
 *                     format: date-time
 *       404:
 *         description: Task not found
 */

router.get('/:id/history', TaskController.getTaskHistory);

module.exports = router;
