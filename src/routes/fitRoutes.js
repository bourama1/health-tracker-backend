const express = require('express');
const router = express.Router();
const { syncGoogleFitSleep } = require('../controllers/fitSyncController');

// POST /api/fit/sync-sleep?days=30
router.post('/sync-sleep', syncGoogleFitSleep);

module.exports = router;
