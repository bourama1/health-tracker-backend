const express = require('express');
const router = express.Router();
const workoutController = require('../controllers/workoutController');

// Exercises
router.get('/exercises', workoutController.getAllExercises);

// Plans
router.get('/plans', workoutController.getPlans);
router.post('/plans', workoutController.createPlan);

// Sessions
router.get('/sessions', workoutController.getSessionHistory);
router.post('/sessions', workoutController.saveSession);

module.exports = router;
