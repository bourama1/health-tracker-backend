const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
require('dotenv').config();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure upload directory exists for progress photos
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer config for photo uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage: storage });

// Initialize SQLite Database
const db = new sqlite3.Database('./health_tracker.db', (err) => {
  if (err) console.error(err.message);
  console.log('Connected to the SQLite database.');
});

// Create Tables
db.serialize(() => {
  // 1. Workouts Table
  db.run(`CREATE TABLE IF NOT EXISTS workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        exercises TEXT, -- Stored as stringified JSON: [{name: 'Squat', weight: 100, sets: 3, reps: 10}]
        steps INTEGER
    )`);

  // 2. Body Measurements Table
  db.run(`CREATE TABLE IF NOT EXISTS measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        bodyweight REAL,
        body_fat REAL,
        chest REAL,
        waist REAL,
        biceps REAL
    )`);

  // 3. Progress Photos Table
  db.run(`CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        front_image_url TEXT,
        side_image_url TEXT,
        back_image_url TEXT
    )`);

  // 4. Sleep Tracking Table
  db.run(`CREATE TABLE IF NOT EXISTS sleep (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        bedtime TEXT,
        sleep_rating INTEGER,
        rhr INTEGER,
        deep_sleep_minutes INTEGER,
        rem_sleep_minutes INTEGER
    )`);
});

// Example API Endpoint: Add a new workout
app.post('/api/workouts', (req, res) => {
  const { date, exercises, steps } = req.body;
  db.run(
    `INSERT INTO workouts (date, exercises, steps) VALUES (?, ?, ?)`,
    [date, JSON.stringify(exercises), steps],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Example API Endpoint: Upload photos
app.post(
  '/api/photos',
  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'side', maxCount: 1 },
    { name: 'back', maxCount: 1 },
  ]),
  (req, res) => {
    const date = req.body.date;
    const frontUrl = req.files['front'] ? req.files['front'][0].path : null;
    const sideUrl = req.files['side'] ? req.files['side'][0].path : null;
    const backUrl = req.files['back'] ? req.files['back'][0].path : null;

    db.run(
      `INSERT INTO photos (date, front_image_url, side_image_url, back_image_url) VALUES (?, ?, ?, ?)`,
      [date, frontUrl, sideUrl, backUrl],
      function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Photos uploaded successfully' });
      }
    );
  }
);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
