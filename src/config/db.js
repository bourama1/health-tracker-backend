const path = require('path');
require('dotenv').config();

const isProduction =
  process.env.DATABASE_URL &&
  (process.env.DATABASE_URL.startsWith('postgres://') ||
    process.env.DATABASE_URL.startsWith('postgresql://'));

const getDatabase = () => {
  if (isProduction) {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    console.log('Connected to PostgreSQL database');

    // Compatibility Layer for SQLite-style methods
    return {
      run: function (sql, params, callback) {
        // Replace ? with $1, $2, etc. for PostgreSQL
        let i = 1;
        const pgSql = sql.replace(/\?/g, () => `$${i++}`);
        pool
          .query(pgSql, params)
          .then((res) => {
            if (callback)
              callback.call(
                { lastID: res.insertId, changes: res.rowCount },
                null
              );
          })
          .catch((err) => {
            if (callback) callback(err);
          });
      },
      all: function (sql, params, callback) {
        let i = 1;
        const pgSql = sql.replace(/\?/g, () => `$${i++}`);
        pool
          .query(pgSql, params)
          .then((res) => {
            if (callback) callback(null, res.rows);
          })
          .catch((err) => {
            if (callback) callback(err);
          });
      },
      serialize: function (callback) {
        callback(); // No-op in PG
      },
      prepare: function (sql) {
        return {
          run: (...params) => {
            // Very basic prepare/run shim for migrations
            let i = 1;
            const pgSql = sql.replace(/\?/g, () => `$${i++}`);
            return pool.query(pgSql, params);
          },
          finalize: () => {},
        };
      },
    };
  } else {
    const sqlite3 = require('sqlite3').verbose();
    // Construct the absolute path using the variable from .env
    const dbName = process.env.DATABASE_NAME || 'health_tracker.db';
    const dbPath = process.env.DATABASE_PATH
      ? process.env.DATABASE_PATH
      : dbName === ':memory:'
      ? dbName
      : path.resolve(__dirname, '../../', dbName);

    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        if (process.env.NODE_ENV !== 'test') {
          console.log(`Connected to SQLite database at: ${dbPath}`);
        }
      }
    });
    return db;
  }
};
const db = getDatabase();

// Helper to handle SQL dialect differences
const translateSql = (sql) => {
  if (!isProduction) return sql;
  return sql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/REAL/gi, 'DOUBLE PRECISION')
    .replace(
      /DATETIME DEFAULT CURRENT_TIMESTAMP/gi,
      'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    )
    .replace(
      /CREATE UNIQUE INDEX IF NOT EXISTS (.*) ON (.*)\((.*)\)/gi,
      'CREATE UNIQUE INDEX $1 ON $2($3)'
    );
};

const safeRun = (sql, params = []) => {
  const finalSql = translateSql(sql);
  db.run(finalSql, params, (err) => {
    if (
      err &&
      !err.message.includes('already exists') &&
      !err.message.includes('duplicate column name')
    ) {
      // console.error(`Error executing SQL: ${finalSql}`, err.message);
    }
  });
};

// Table initialization
db.serialize(() => {
  safeRun(`CREATE TABLE IF NOT EXISTS measurements (
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

  safeRun(`CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE,
      front_path TEXT,
      side_path TEXT,
      back_path TEXT
    )`);

  safeRun(`CREATE TABLE IF NOT EXISTS sleep (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE,
      bedtime TEXT,
      wake_time TEXT,
      rhr INTEGER,
      sleep_score INTEGER,
      deep_sleep_minutes INTEGER,
      rem_sleep_minutes INTEGER
    )`);

  // Migration logic
  const addCol = (table, col, type) => {
    const finalType = isProduction
      ? type.replace(/REAL/gi, 'DOUBLE PRECISION')
      : type;
    safeRun(`ALTER TABLE ${table} ADD COLUMN ${col} ${finalType}`);
  };

  addCol('measurements', 'forearm', 'REAL');
  addCol('measurements', 'calf', 'REAL');
  addCol('measurements', 'thigh', 'REAL');
  addCol('photos', 'front_path', 'TEXT');
  addCol('photos', 'side_path', 'TEXT');
  addCol('photos', 'back_path', 'TEXT');
  addCol('sleep', 'wake_time', 'TEXT');
  addCol('sleep', 'sleep_score', 'INTEGER');

  if (!isProduction) {
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_date ON sleep(date)`);
  }

  // Workout Tracking Tables
  safeRun(`CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT,
      category TEXT,
      equipment TEXT,
      primary_muscles TEXT,
      secondary_muscles TEXT,
      force TEXT,
      level TEXT,
      mechanic TEXT,
      instructions TEXT
    )`);

  addCol('exercises', 'secondary_muscles', 'TEXT');
  addCol('exercises', 'force', 'TEXT');
  addCol('exercises', 'level', 'TEXT');
  addCol('exercises', 'mechanic', 'TEXT');
  addCol('exercises', 'instructions', 'TEXT');

  safeRun(`CREATE TABLE IF NOT EXISTS workout_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  safeRun(`CREATE TABLE IF NOT EXISTS workout_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER,
      name TEXT,
      day_order INTEGER,
      FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
    )`);

  safeRun(`CREATE TABLE IF NOT EXISTS workout_day_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER,
      exercise_id TEXT,
      default_sets INTEGER,
      default_reps INTEGER,
      default_weight REAL,
      exercise_order INTEGER,
      target_rpe REAL,
      reps_min INTEGER,
      reps_max INTEGER,
      exercise_type TEXT DEFAULT 'weighted',
      FOREIGN KEY (day_id) REFERENCES workout_days(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    )`);

  addCol('workout_day_exercises', 'target_rpe', 'REAL');
  addCol('workout_day_exercises', 'reps_min', 'INTEGER');
  addCol('workout_day_exercises', 'reps_max', 'INTEGER');
  addCol('workout_day_exercises', 'exercise_type', "TEXT DEFAULT 'weighted'");

  safeRun(`CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_id INTEGER,
      date TEXT,
      notes TEXT,
      FOREIGN KEY (day_id) REFERENCES workout_days(id)
    )`);

  safeRun(`CREATE TABLE IF NOT EXISTS workout_session_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      exercise_id TEXT,
      set_number INTEGER,
      weight REAL,
      reps INTEGER,
      rpe REAL,
      notes TEXT,
      duration_seconds INTEGER,
      is_pr INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    )`);
});

module.exports = db;
