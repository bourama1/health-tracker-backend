const express = require('express');
const router = express.Router();
const mfpController = require('../controllers/mfpController');

router.post('/import', mfpController.importDiary);

module.exports = router;
