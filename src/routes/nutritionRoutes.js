const express = require('express');
const router = express.Router();
const nutritionController = require('../controllers/nutritionController');

router.get('/diary', nutritionController.getDiary);
router.get('/diary/:id', nutritionController.getDiaryEntry);
router.post('/diary', nutritionController.createMeal);
router.patch('/diary/:id', nutritionController.updateMeal);
router.delete('/diary/:id', nutritionController.deleteMeal);
router.get('/summary', nutritionController.getSummary);

module.exports = router;
