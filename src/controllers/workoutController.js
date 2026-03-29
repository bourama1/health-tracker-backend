const db = require('../config/db');

// Exercises
exports.getAllExercises = (req, res) => {
  const query = `SELECT * FROM exercises ORDER BY name ASC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};

// Plans
exports.getPlans = (req, res) => {
  const query = `
    SELECT 
      wp.id as plan_id, wp.name as plan_name, wp.description,
      wd.id as day_id, wd.name as day_name, wd.day_order,
      wde.id as wde_id, wde.exercise_id, wde.default_sets, wde.default_reps, wde.default_weight, wde.exercise_order,
      e.name as exercise_name
    FROM workout_plans wp
    LEFT JOIN workout_days wd ON wp.id = wd.plan_id
    LEFT JOIN workout_day_exercises wde ON wd.id = wde.day_id
    LEFT JOIN exercises e ON wde.exercise_id = e.id
    ORDER BY wp.id, wd.day_order, wde.exercise_order
  `;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });

    // Restructure into nested object
    const plansMap = {};
    rows.forEach(row => {
      if (!plansMap[row.plan_id]) {
        plansMap[row.plan_id] = {
          id: row.plan_id,
          name: row.plan_name,
          description: row.description,
          days: []
        };
      }

      if (row.day_id) {
        let day = plansMap[row.plan_id].days.find(d => d.id === row.day_id);
        if (!day) {
          day = {
            id: row.day_id,
            name: row.day_name,
            day_order: row.day_order,
            exercises: []
          };
          plansMap[row.plan_id].days.push(day);
        }

        if (row.wde_id) {
          day.exercises.push({
            id: row.wde_id,
            exercise_id: row.exercise_id,
            name: row.exercise_name,
            sets: row.default_sets,
            reps: row.default_reps,
            weight: row.default_weight,
            order: row.exercise_order
          });
        }
      }
    });

    res.json(Object.values(plansMap));
  });
};

exports.createPlan = (req, res) => {
  const { name, description, days } = req.body;

  if (!name) return res.status(400).json({ error: 'Plan name is required' });

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    const planQuery = `INSERT INTO workout_plans (name, description) VALUES (?, ?)`;
    db.run(planQuery, [name, description], function(err) {
      if (err) {
        db.run('ROLLBACK');
        return res.status(400).json({ error: err.message });
      }

      const planId = this.lastID;

      if (days && days.length > 0) {
        const dayStmt = db.prepare(`INSERT INTO workout_days (plan_id, name, day_order) VALUES (?, ?, ?)`);
        const exerciseStmt = db.prepare(`
          INSERT INTO workout_day_exercises (day_id, exercise_id, default_sets, default_reps, default_weight, exercise_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        days.forEach((day, dayIndex) => {
          dayStmt.run([planId, day.name, dayIndex], function(err) {
            if (err) {
              db.run('ROLLBACK');
              return res.status(400).json({ error: err.message });
            }

            const dayId = this.lastID;
            if (day.exercises && day.exercises.length > 0) {
              day.exercises.forEach((exercise, exerciseIndex) => {
                exerciseStmt.run([
                  dayId,
                  exercise.exercise_id,
                  exercise.sets,
                  exercise.reps,
                  exercise.weight,
                  exerciseIndex
                ]);
              });
            }
          });
        });

        // This is a bit tricky with nested async-like run calls
        // In a real app we might use promises and async/await for clearer logic
      }

      db.run('COMMIT', (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: err.message });
        }
        res.json({ id: planId, message: 'Workout plan created successfully' });
      });
    });
  });
};

// Sessions
exports.saveSession = (req, res) => {
  const { day_id, date, logs } = req.body;

  if (!day_id || !date) {
    return res.status(400).json({ error: 'day_id and date are required' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    const sessionQuery = `INSERT INTO workout_sessions (day_id, date) VALUES (?, ?)`;
    db.run(sessionQuery, [day_id, date], function(err) {
      if (err) {
        db.run('ROLLBACK');
        return res.status(400).json({ error: err.message });
      }

      const sessionId = this.lastID;

      if (logs && logs.length > 0) {
        const logStmt = db.prepare(`
          INSERT INTO workout_session_logs (session_id, exercise_id, set_number, weight, reps)
          VALUES (?, ?, ?, ?, ?)
        `);

        logs.forEach(log => {
          logStmt.run([sessionId, log.exercise_id, log.set_number, log.weight, log.reps]);
        });
        logStmt.finalize();
      }

      db.run('COMMIT', (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: err.message });
        }
        res.json({ id: sessionId, message: 'Workout session saved successfully' });
      });
    });
  });
};

exports.getSessionHistory = (req, res) => {
  const query = `
    SELECT 
      ws.id as session_id, ws.date, wd.name as day_name,
      wsl.id as log_id, wsl.exercise_id, wsl.set_number, wsl.weight, wsl.reps,
      e.name as exercise_name
    FROM workout_sessions ws
    JOIN workout_days wd ON ws.day_id = wd.id
    LEFT JOIN workout_session_logs wsl ON ws.id = wsl.session_id
    LEFT JOIN exercises e ON wsl.exercise_id = e.id
    ORDER BY ws.date DESC, wsl.session_id, wsl.exercise_id, wsl.set_number
  `;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });

    const sessionsMap = {};
    rows.forEach(row => {
      if (!sessionsMap[row.session_id]) {
        sessionsMap[row.session_id] = {
          id: row.session_id,
          date: row.date,
          day_name: row.day_name,
          logs: []
        };
      }

      if (row.log_id) {
        sessionsMap[row.session_id].logs.push({
          id: row.log_id,
          exercise_id: row.exercise_id,
          exercise_name: row.exercise_name,
          set_number: row.set_number,
          weight: row.weight,
          reps: row.reps
        });
      }
    });

    res.json(Object.values(sessionsMap));
  });
};
