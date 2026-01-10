const express = require('express');
const router = express.Router();
const TaskController = require('../controllers/taskController');

// 1. Create Task Page (GET form, POST data)
router.get('/create-task', TaskController.getCreatePage);
router.post('/create-task', TaskController.postCreateTask);

// 2. Home Page (Moving this logic out of app.js is cleaner)
router.get('/', (req, res) => {
  res.render('index.html');
});

// 3. Edit Task Page
router.get('/edit-task/:id', TaskController.getEditPage);
router.post('/edit-task/:id', TaskController.postEditTask);

// 4. Delete Flow
// GET the confirmation page
router.get('/delete-task/:id/confirm', TaskController.getDeleteConfirmPage);
// POST the actual deletion
router.post('/delete-task/:id', TaskController.postDeleteTask);
module.exports = router;