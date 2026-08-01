const express = require('express');
const router = express.Router();
const statBuilderController = require('../controllers/statBuilderController');

router.get('/data', statBuilderController.getData);
router.put('/stats', statBuilderController.updateStats);
router.post('/skills', statBuilderController.createSkill);
router.put('/skills/:id', statBuilderController.updateSkill);
router.delete('/skills/:id', statBuilderController.deleteSkill);
router.post('/log', statBuilderController.toggleLog);
router.post('/freeze', statBuilderController.toggleFreeze);
router.get('/logs', statBuilderController.getLogs);
router.post('/calculate-week', statBuilderController.calculateWeek);
router.put('/unlock', statBuilderController.setUnlock);
router.post('/reset-week', statBuilderController.resetWeek);

module.exports = router;
