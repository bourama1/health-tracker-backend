const express = require('express');
const router = express.Router();
const ultrahumanSyncController = require('../controllers/ultrahumanSyncController');

router.get('/sync', ultrahumanSyncController.syncUltrahumanData);

module.exports = router;
