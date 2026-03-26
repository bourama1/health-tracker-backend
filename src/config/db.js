const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const getDatabase = () => {
  // Construct the absolute path using the variable from .env
  // This goes up two levels from src/config/ to the project root
  const dbName = process.env.DATABASE_NAME || 'health_tracker.db';
  const dbPath = dbName === ':memory:' ? dbName : path.resolve(__dirname, '../../', dbName);

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
      biceps REAL
    )`);
  });

  return db;
};

module.exports = getDatabase();
