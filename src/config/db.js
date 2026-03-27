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
  });

  return db;
};

module.exports = getDatabase();
