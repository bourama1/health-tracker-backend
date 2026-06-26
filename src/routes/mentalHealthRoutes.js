const express = require('express');
const router = express.Router();
const mentalHealthController = require('../controllers/mentalHealthController');

router.get('/', mentalHealthController.getAllEntries);
router.post('/', mentalHealthController.createEntry);
router.delete('/:id', mentalHealthController.deleteEntry);

module.exports = router;
