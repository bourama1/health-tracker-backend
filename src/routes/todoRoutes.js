const express = require('express');
const router = express.Router();
const todoController = require('../controllers/todoController');

router.get('/tasks', todoController.getTasks);
router.post('/tasks', todoController.createTask);
router.put('/tasks/:id', todoController.updateTask);
router.delete('/tasks/:id', todoController.deleteTask);
router.post('/tasks/:id/complete', todoController.completeTask);
router.post('/tasks/:id/uncomplete', todoController.uncompleteTask);

module.exports = router;
