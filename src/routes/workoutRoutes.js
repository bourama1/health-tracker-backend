const express = require('express');
const router = express.Router();
const c = require('../controllers/workoutController');

// Exercises
router.get('/exercises/suggestion/:exercise_id', c.getExerciseSuggestion);
router.get('/exercises/filters', c.getExerciseFilters);
router.get('/exercises/:id', c.getExerciseById);
router.get('/exercises', c.getAllExercises);

// Plans
router.get('/plans', c.getPlans);
router.post('/plans', c.createPlan);
router.put('/plans/:id', c.updatePlan);
router.delete('/plans/:id', c.deletePlan);
router.put('/days/:day_id/exercises', c.updateDayExercises);

// Sessions
router.get('/sessions', c.getSessionHistory);
router.post('/sessions', c.saveSession);
router.get('/sessions/last-for-day/:day_id', c.getLastSessionForDay);

// Analytics
router.get('/progress/:exercise_id', c.getExerciseProgress);
router.get('/stats', c.getStats);
router.get('/last-trained-muscles', c.getLastTrainedMuscles);

module.exports = router;
