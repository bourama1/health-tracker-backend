const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const getDatabase = () => {
  // Construct the absolute path using the variable from .env
  // This goes up two levels from src/config/ to the project root
  const dbName = process.env.DATABASE_NAME || 'health_tracker.db';
  const dbPath =
    dbName === ':memory:' ? dbName : path.resolve(__dirname, '../../', dbName);

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
    } else {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`Connected to database at: ${dbPath}`);
      }
    }
  });

  // Table initialization remains the same
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      bodyweight REAL,
      body_fat REAL,
      chest REAL,
      waist REAL,
      biceps REAL,
      forearm REAL,
      calf REAL,
      thigh REAL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE,
      front_path TEXT,
      side_path TEXT,
      back_path TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sleep (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE,
      bedtime TEXT,
      wake_time TEXT,
      rhr INTEGER,
      sleep_score INTEGER,
      deep_sleep_minutes INTEGER,
      rem_sleep_minutes INTEGER
    )`);

    // Basic migration logic: Add columns if they don't exist
    const addColumnIfNotExists = (tableName, columnName, type) => {
      db.run(
        `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${type}`,
        (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            // It's expected that this might fail if the column already exists
            // console.error(`Error adding ${columnName} to ${tableName}:`, err.message);
          }
        }
      );
    };

    addColumnIfNotExists('measurements', 'forearm', 'REAL');
    addColumnIfNotExists('measurements', 'calf', 'REAL');
    addColumnIfNotExists('measurements', 'thigh', 'REAL');

    addColumnIfNotExists('photos', 'front_path', 'TEXT');
    addColumnIfNotExists('photos', 'side_path', 'TEXT');
    addColumnIfNotExists('photos', 'back_path', 'TEXT');

    addColumnIfNotExists('sleep', 'wake_time', 'TEXT');
    addColumnIfNotExists('sleep', 'sleep_score', 'INTEGER');

    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_date ON sleep(date)`);

    // Workout Tracking Tables
    db.run(`CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT,
      category TEXT,
      equipment TEXT,
      primary_muscles TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS workout_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS workout_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER,
      name TEXT,
      day_order INTEGER,
      FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS workout_day_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER,
      exercise_id TEXT,
      default_sets INTEGER,
      default_reps INTEGER,
      default_weight REAL,
      exercise_order INTEGER,
      FOREIGN KEY (day_id) REFERENCES workout_days(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER,
      date TEXT,
      FOREIGN KEY (day_id) REFERENCES workout_days(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS workout_session_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      exercise_id TEXT,
      set_number INTEGER,
      weight REAL,
      reps INTEGER,
      FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    )`);
  });

  return db;
};

module.exports = getDatabase();
