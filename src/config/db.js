const path = require('path');
require('dotenv').config();

const isProduction =
  process.env.RENDER === 'true' ||
  !!process.env.RENDER ||
  process.env.NODE_ENV === 'production' ||
  (process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith('postgres://') ||
      process.env.DATABASE_URL.startsWith('postgresql://')));

console.error(
  `[DB] Detected environment: ${
    isProduction ? 'Production (PostgreSQL)' : 'Local (SQLite)'
  }`
);
if (!isProduction) {
  console.error(`[DB] RENDER env: ${process.env.RENDER}`);
  console.error(`[DB] NODE_ENV: ${process.env.NODE_ENV}`);
  console.error(`[DB] DATABASE_URL exists: ${!!process.env.DATABASE_URL}`);
}

const getDatabase = () => {
  if (isProduction) {
    console.error('[DB] Initializing PostgreSQL connection pool...');
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    console.error('[DB] Connected to PostgreSQL database');

    // Replace ? with $1, $2, ... for PostgreSQL
    const toPgSql = (sql) => {
      let i = 1;
      return sql.replace(/\?/g, () => `$${i++}`);
    };

    return {
      // run() returns a Promise AND fires callback if provided
      run: function (sql, params, callback) {
        if (typeof params === 'function') {
          callback = params;
          params = [];
        }
        const pgSql = toPgSql(sql);
        const promise = pool.query(pgSql, params || []);
        promise
          .then((res) => {
            if (callback)
              callback.call(
                { lastID: res.rows[0]?.id ?? null, changes: res.rowCount },
                null
              );
          })
          .catch((err) => {
            if (callback) callback(err);
          });
        return promise; // ← CRITICAL FIX: controllers call .then() on this
      },

      // all() returns a Promise of rows AND fires callback if provided
      all: function (sql, params, callback) {
        if (typeof params === 'function') {
          callback = params;
          params = [];
        }
        const pgSql = toPgSql(sql);
        const promise = pool.query(pgSql, params || []).then((res) => res.rows);
        promise
          .then((rows) => {
            if (callback) callback(null, rows);
          })
          .catch((err) => {
            if (callback) callback(err);
          });
        return promise;
      },

      // get() returns a Promise of single row AND fires callback if provided
      get: function (sql, params, callback) {
        if (typeof params === 'function') {
          callback = params;
          params = [];
        }
        const pgSql = toPgSql(sql);
        const promise = pool
          .query(pgSql, params || [])
          .then((res) => res.rows[0] ?? null);
        promise
          .then((row) => {
            if (callback) callback(null, row);
          })
          .catch((err) => {
            if (callback) callback(err);
          });
        return promise;
      },

      serialize: function (callback) {
        callback(); // No-op in PostgreSQL
      },

      prepare: function (sql) {
        return {
          run: (...params) => pool.query(toPgSql(sql), params),
          finalize: () => {},
        };
      },
    };
  } else {
    try {
      console.error('[DB] Initializing SQLite connection...');
      const sqlite3 = require('sqlite3').verbose();
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
            console.error(`Connected to SQLite database at: ${dbPath}`);
          }
        }
      });

      // Wrap SQLite to support both promises and callbacks to match PG implementation
      const wrapper = {
        run: (sql, params = [], callback) => {
          if (typeof params === 'function') {
            callback = params;
            params = [];
          }
          const promise = new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
              if (err) {
                if (callback) {
                  callback(err);
                  resolve(); // Resolve anyway if callback handled it to avoid unhandled rejection
                } else {
                  reject(err);
                }
              } else {
                const result = { lastID: this.lastID, changes: this.changes };
                if (callback) callback.call(this, null);
                resolve(result);
              }
            });
          });
          return promise;
        },
        all: (sql, params = [], callback) => {
          if (typeof params === 'function') {
            callback = params;
            params = [];
          }
          const promise = new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
              if (err) {
                if (callback) {
                  callback(err);
                  resolve();
                } else {
                  reject(err);
                }
              } else {
                if (callback) callback(null, rows);
                resolve(rows);
              }
            });
          });
          return promise;
        },
        get: (sql, params = [], callback) => {
          if (typeof params === 'function') {
            callback = params;
            params = [];
          }
          const promise = new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
              if (err) {
                if (callback) {
                  callback(err);
                  resolve();
                } else {
                  reject(err);
                }
              } else {
                if (callback) callback(null, row);
                resolve(row);
              }
            });
          });
          return promise;
        },
        serialize: (callback) => db.serialize(callback),
        close: (callback) => db.close(callback),
        on: (event, callback) => db.on(event, callback),
      };
      return wrapper;
    } catch (err) {
      console.error(
        '[DB] CRITICAL: Failed to load SQLite driver:',
        err.message
      );
      if (process.env.RENDER) {
        throw new Error(
          'Environment detection failed on Render. Check DATABASE_URL.'
        );
      }
      throw err;
    }
  }
};

const db = getDatabase();

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
      'CREATE UNIQUE INDEX IF NOT EXISTS $1 ON $2($3)'
    );
};

const safeRun = (sql, params = []) => {
  const finalSql = translateSql(sql);
  return db.run(finalSql, params).catch((err) => {
    if (
      err &&
      !err.message.includes('already exists') &&
      !err.message.includes('duplicate column name') &&
      !err.message.includes('no such table')
    ) {
      console.error(`[DB] safeRun error for SQL: ${finalSql}`, err.message);
    }
  });
};

// Table initialization
db.serialize(() => {
  safeRun(`CREATE TABLE IF NOT EXISTS measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
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
      user_id TEXT,
      date TEXT,
      front_path TEXT,
      side_path TEXT,
      back_path TEXT,
      front_google_id TEXT,
      side_google_id TEXT,
      back_google_id TEXT,
      UNIQUE(user_id, date)
    )`);

  safeRun(`CREATE TABLE IF NOT EXISTS sleep (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      date TEXT,
      bedtime TEXT,
      wake_time TEXT,
      rhr INTEGER,
      deep_sleep_minutes INTEGER,
      rem_sleep_minutes INTEGER,
      restorative_sleep_percentage INTEGER,
      movements INTEGER,
      tosses_and_turns INTEGER,
      UNIQUE(user_id, date)
    )`);

  safeRun(`CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      date TEXT,
      steps INTEGER,
      active_minutes INTEGER,
      movement_index INTEGER,
      UNIQUE(user_id, date)
    )`);

  const addCol = (table, col, type) => {
    const finalType = isProduction
      ? type.replace(/REAL/gi, 'DOUBLE PRECISION')
      : type;
    safeRun(`ALTER TABLE ${table} ADD COLUMN ${col} ${finalType}`);
  };

  addCol('measurements', 'user_id', 'TEXT');
  addCol('photos', 'user_id', 'TEXT');
  addCol('sleep', 'user_id', 'TEXT');
  addCol('workout_plans', 'user_id', 'TEXT');
  addCol('workout_sessions', 'user_id', 'TEXT');

  addCol('measurements', 'forearm', 'REAL');
  addCol('measurements', 'calf', 'REAL');
  addCol('measurements', 'thigh', 'REAL');
  addCol('measurements', 'vo2_max', 'REAL');
  addCol('photos', 'front_path', 'TEXT');
  addCol('photos', 'side_path', 'TEXT');
  addCol('photos', 'back_path', 'TEXT');
  addCol('photos', 'front_google_id', 'TEXT');
  addCol('photos', 'side_google_id', 'TEXT');
  addCol('photos', 'back_google_id', 'TEXT');
  addCol('sleep', 'wake_time', 'TEXT');
  addCol('sleep', 'awake_minutes', 'INTEGER');
  addCol('sleep', 'light_minutes', 'INTEGER');
  addCol('sleep', 'hrv', 'REAL');
  addCol('sleep', 'sleep_score', 'REAL');
  addCol('sleep', 'temp_dev', 'REAL');
  addCol('sleep', 'recovery_index', 'INTEGER');
  addCol('sleep', 'restorative_sleep_percentage', 'INTEGER');
  addCol('sleep', 'movements', 'INTEGER');
  addCol('sleep', 'tosses_and_turns', 'INTEGER');

  // Ensure unique indexes exist for ON CONFLICT to work in PostgreSQL
  safeRun(`DROP INDEX IF EXISTS idx_sleep_date`);
  safeRun(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_user_date ON sleep(user_id, date)`
  );
  safeRun(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_measurements_user_date ON measurements(user_id, date)`
  );
  safeRun(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_user_date ON photos(user_id, date)`
  );

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
      user_id TEXT,
      name TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  safeRun(`CREATE TABLE IF NOT EXISTS workout_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER,
      name TEXT,
      day_order INTEGER,
      scheduled_days TEXT,
      FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
    )`);

  addCol('workout_days', 'scheduled_days', 'TEXT');

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
      user_id TEXT,
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

  safeRun(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      picture TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

module.exports = db;
