const db = require('../config/db');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer Storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'health-tracker-photos',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
  }
});

const upload = multer({ storage: storage });

exports.uploadMiddleware = upload.fields([
  { name: 'front', maxCount: 1 },
  { name: 'side', maxCount: 1 },
  { name: 'back', maxCount: 1 }
]);

exports.savePhotos = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { date } = req.body || {};
  if (!date) return res.status(400).json({ error: 'Date is required' });

  // Extract Cloudinary URLs from the uploaded files
  const front_path = req.files && req.files['front'] ? req.files['front'][0].path : null;
  const side_path = req.files && req.files['side'] ? req.files['side'][0].path : null;
  const back_path = req.files && req.files['back'] ? req.files['back'][0].path : null;

  db.get('SELECT * FROM photos WHERE user_id = ? AND date = ?', [req.session.user.id, date], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });

    if (row) {
      // Update existing record
      const query = `
        UPDATE photos
        SET front_path = COALESCE(?, front_path),
            side_path = COALESCE(?, side_path),
            back_path = COALESCE(?, back_path)
        WHERE user_id = ? AND date = ?
      `;
      db.run(query, [front_path, side_path, back_path, req.session.user.id, date], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: 'Photos updated successfully' });
      });
    } else {
      // Insert new record
      const query = `
        INSERT INTO photos (user_id, date, front_path, side_path, back_path)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(query, [req.session.user.id, date, front_path, side_path, back_path], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: 'Photos saved successfully' });
      });
    }
  });
};

exports.getPhotosByDate = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { date } = req.params;
  const query = `SELECT * FROM photos WHERE user_id = ? AND date = ?`;
  
  db.get(query, [req.session.user.id, date], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(row || {});
  });
};

exports.getAllPhotoDates = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const query = `SELECT date FROM photos WHERE user_id = ? ORDER BY date DESC`;
  db.all(query, [req.session.user.id], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};

// No longer need Google-specific methods
exports.listGooglePhotos = (req, res) => res.status(410).json({ error: 'Google Photos API is deprecated in this app.' });
