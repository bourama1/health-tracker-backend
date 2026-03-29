const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer for storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir =
      process.env.NODE_ENV === 'test'
        ? path.join(__dirname, '../../test-uploads/photos')
        : path.join(__dirname, '../../uploads/photos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // We'll use fieldname + date for filename
    const date = req.body.date || new Date().toISOString().split('T')[0];
    const ext = path.extname(file.originalname);
    cb(null, `${date}-${file.fieldname}${ext}`);
  },
});

const upload = multer({ storage: storage });

exports.uploadMiddleware = upload.fields([
  { name: 'front', maxCount: 1 },
  { name: 'side', maxCount: 1 },
  { name: 'back', maxCount: 1 },
]);

exports.savePhotos = (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required' });

  const prefix = process.env.NODE_ENV === 'test' ? 'test-uploads' : 'uploads';

  const frontPath = req.files['front']
    ? `${prefix}/photos/${req.files['front'][0].filename}`
    : null;
  const sidePath = req.files['side']
    ? `${prefix}/photos/${req.files['side'][0].filename}`
    : null;
  const backPath = req.files['back']
    ? `${prefix}/photos/${req.files['back'][0].filename}`
    : null;

  // We want to update only the fields that are provided
  // SQLite doesn't support ON CONFLICT ... SET column = COALESCE(excluded.column, table.column) as easily in old versions,
  // but we can try the standard syntax if supported, or just do it in two steps.
  // Actually, let's just check if record exists first to be safe and clear.

  db.get('SELECT * FROM photos WHERE date = ?', [date], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });

    if (row) {
      // Update
      const query = `
        UPDATE photos
        SET front_path = COALESCE(?, front_path),
            side_path = COALESCE(?, side_path),
            back_path = COALESCE(?, back_path)
        WHERE date = ?
      `;
      db.run(query, [frontPath, sidePath, backPath, date], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: 'Photos updated successfully' });
      });
    } else {
      // Insert
      const query = `
        INSERT INTO photos (date, front_path, side_path, back_path)
        VALUES (?, ?, ?, ?)
      `;
      db.run(query, [date, frontPath, sidePath, backPath], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: 'Photos saved successfully' });
      });
    }
  });
};

exports.getPhotosByDate = (req, res) => {
  const { date } = req.params;
  const query = `SELECT * FROM photos WHERE date = ?`;
  db.get(query, [date], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(row || {});
  });
};

exports.getAllPhotoDates = (req, res) => {
  const query = `SELECT date FROM photos ORDER BY date DESC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};
