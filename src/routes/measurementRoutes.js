const express = require('express');
const router = express.Router();
const measurementController = require('../controllers/measurementController');

// Define routes
router.get('/', measurementController.getAllMeasurements);
router.post('/', measurementController.createMeasurement);

module.exports = router;
