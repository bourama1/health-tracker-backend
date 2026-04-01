const express = require('express');
const router = express.Router();
const photoController = require('../controllers/photoController');

router.post('/', photoController.uploadMiddleware, photoController.savePhotos);
router.get('/google-photos', photoController.listGooglePhotos);
router.get('/dates', photoController.getAllPhotoDates);
router.get('/:date', photoController.getPhotosByDate);

module.exports = router;
