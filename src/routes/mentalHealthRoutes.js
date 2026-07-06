const express = require('express');
const router = express.Router();
const mentalHealthController = require('../controllers/mentalHealthController');
const journalController = require('../controllers/journalController');

router.get('/', mentalHealthController.getAllEntries);
router.post('/', mentalHealthController.createEntry);
router.delete('/:id', mentalHealthController.deleteEntry);

router.post('/checkin', mentalHealthController.saveCheckin);
router.get('/checkin/:date', mentalHealthController.getCheckin);

router.get('/journal/:date', journalController.getEntry);
router.post('/journal', journalController.saveEntry);
router.get('/journal', journalController.getAllEntries);

module.exports = router;
