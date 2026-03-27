const express = require('express');
const router = express.Router();
const sleepController = require('../controllers/sleepController');

router.get('/', sleepController.getAllSleep);
router.post('/', sleepController.createSleep);

module.exports = router;
