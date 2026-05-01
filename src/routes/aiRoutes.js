const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

router.post('/analyze', aiController.analyzeData);
router.post('/chat', aiController.chat);

module.exports = router;
