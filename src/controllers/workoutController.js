const db = require('../config/db');

// ─── Helpers ────────────────────────────────────────────────────────────────

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

/**
 * Calculates Estimated 1RM using Brzycki formula with RPE adjustment.
 * Effective reps = actual_reps + (10 - RPE)
 * e1RM = weight / (1.0278 - 0.0278 * effective_reps)
 */
const calculateE1RM = (weight, reps, rpe) => {
  if (!weight || !reps) return null;
  const effectiveReps = reps + (10 - (rpe || 10));
  if (effectiveReps > 36) return null; // Formula breaks down at high reps
  return weight / (1.0278 - 0.0278 * effectiveReps);
};

/**
 * Given a target reps and target RPE, suggests a weight based on a known e1RM.
 * weight = e1RM * (1.0278 - 0.0278 * effectiveReps)
 */
const suggestWeight = (e1RM, targetReps, targetRPE) => {
  if (!e1RM || !targetReps) return null;
  const effectiveReps = targetReps + (10 - (targetRPE || 10));
  return e1RM * (1.0278 - 0.0278 * effectiveReps);
};

// ─── Schema upgrades (safe – runs once at startup) ───────────────────────────
db.serialize(() => {
  db.run(`ALTER TABLE workout_sessions ADD COLUMN notes TEXT`, () => {});
  db.run(`ALTER TABLE workout_session_logs ADD COLUMN notes TEXT`, () => {});
  db.run(`ALTER TABLE workout_session_logs ADD COLUMN rpe REAL`, () => {});
  db.run(
    `ALTER TABLE workout_day_exercises ADD COLUMN exercise_type TEXT DEFAULT 'weighted'`,
    () => {}
  );
  db.run(
    `ALTER TABLE workout_session_logs ADD COLUMN duration_seconds INTEGER`,
    () => {}
  );
  db.run(
    `ALTER TABLE workout_session_logs ADD COLUMN is_pr INTEGER DEFAULT 0`,
    () => {}
  );
});

// ─── Exercises ───────────────────────────────────────────────────────────────

exports.getAllExercises = async (req, res) => {
  try {
    const { search, category, muscle, equipment, level, mechanic, force } =
      req.query;
    let sql = `SELECT * FROM exercises WHERE 1=1`;
    const params = [];
    if (search) {
      sql += ` AND (name LIKE ? OR primary_muscles LIKE ? OR secondary_muscles LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    if (muscle) {
      sql += ` AND (primary_muscles LIKE ? OR secondary_muscles LIKE ?)`;
      params.push(`%${muscle}%`, `%${muscle}%`);
    }
    if (equipment) {
      sql += ` AND equipment = ?`;
      params.push(equipment);
    }
    if (level) {
      sql += ` AND level = ?`;
      params.push(level);
    }
    if (mechanic) {
      sql += ` AND mechanic = ?`;
      params.push(mechanic);
    }
    if (force) {
      sql += ` AND force = ?`;
      params.push(force);
    }
    sql += ` ORDER BY name ASC`;
    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getExerciseById = async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM exercises WHERE id = ?`, [
      req.params.id,
    ]);
    if (!rows.length)
      return res.status(404).json({ error: 'Exercise not found' });
    const ex = rows[0];
    if (ex.instructions) {
      try {
        ex.instructions = JSON.parse(ex.instructions);
      } catch (_) {}
    }
    res.json(ex);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getExerciseFilters = async (req, res) => {
  try {
    const [categories, equipment, levels, mechanics, forces] =
      await Promise.all([
        dbAll(
          `SELECT DISTINCT category FROM exercises WHERE category IS NOT NULL ORDER BY category`
        ),
        dbAll(
          `SELECT DISTINCT equipment FROM exercises WHERE equipment IS NOT NULL ORDER BY equipment`
        ),
        dbAll(
          `SELECT DISTINCT level FROM exercises WHERE level IS NOT NULL ORDER BY level`
        ),
        dbAll(
          `SELECT DISTINCT mechanic FROM exercises WHERE mechanic IS NOT NULL ORDER BY mechanic`
        ),
        dbAll(
          `SELECT DISTINCT force FROM exercises WHERE force IS NOT NULL ORDER BY force`
        ),
      ]);
    // Collect all unique muscle names from primary + secondary
    const muscleRows = await dbAll(
      `SELECT primary_muscles, secondary_muscles FROM exercises`
    );
    const muscleSet = new Set();
    muscleRows.forEach((r) => {
      (r.primary_muscles || '').split(',').forEach((m) => {
        const t = m.trim();
        if (t) muscleSet.add(t);
      });
      (r.secondary_muscles || '').split(',').forEach((m) => {
        const t = m.trim();
        if (t) muscleSet.add(t);
      });
    });
    res.json({
      categories: categories.map((r) => r.category),
      equipment: equipment.map((r) => r.equipment),
      levels: levels.map((r) => r.level),
      mechanics: mechanics.map((r) => r.mechanic),
      forces: forces.map((r) => r.force),
      muscles: Array.from(muscleSet).sort(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ─── Plans ────────────────────────────────────────────────────────────────────

exports.getPlans = async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT
        wp.id as plan_id, wp.name as plan_name, wp.description,
        wd.id as day_id, wd.name as day_name, wd.day_order,
        wde.id as wde_id, wde.exercise_id, wde.default_sets,
        wde.default_reps, wde.default_weight, wde.exercise_order,
        wde.exercise_type, wde.target_rpe, wde.reps_min, wde.reps_max,
        e.name as exercise_name, e.primary_muscles, e.category
      FROM workout_plans wp
      LEFT JOIN workout_days wd ON wp.id = wd.plan_id
      LEFT JOIN workout_day_exercises wde ON wd.id = wde.day_id
      LEFT JOIN exercises e ON wde.exercise_id = e.id
      ORDER BY wp.id, wd.day_order, wde.exercise_order
    `);

    const plansMap = {};
    rows.forEach((row) => {
      if (!plansMap[row.plan_id]) {
        plansMap[row.plan_id] = {
          id: row.plan_id,
          name: row.plan_name,
          description: row.description,
          days: [],
        };
      }
      if (row.day_id) {
        let day = plansMap[row.plan_id].days.find((d) => d.id === row.day_id);
        if (!day) {
          day = {
            id: row.day_id,
            name: row.day_name,
            day_order: row.day_order,
            exercises: [],
          };
          plansMap[row.plan_id].days.push(day);
        }
        if (row.wde_id) {
          day.exercises.push({
            id: row.wde_id,
            exercise_id: row.exercise_id,
            name: row.exercise_name,
            primary_muscles: row.primary_muscles,
            category: row.category,
            sets: row.default_sets,
            reps: row.default_reps,
            weight: row.default_weight,
            exercise_type: row.exercise_type || 'weighted',
            target_rpe: row.target_rpe,
            reps_min: row.reps_min,
            reps_max: row.reps_max,
            order: row.exercise_order,
          });
        }
      }
    });

    res.json(Object.values(plansMap));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.createPlan = async (req, res) => {
  const { name, description, days } = req.body;
  if (!name) return res.status(400).json({ error: 'Plan name is required' });

  try {
    await dbRun('BEGIN TRANSACTION');
    const { lastID: planId } = await dbRun(
      `INSERT INTO workout_plans (name, description) VALUES (?, ?)`,
      [name, description]
    );

    if (days && days.length > 0) {
      for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
        const day = days[dayIndex];
        const { lastID: dayId } = await dbRun(
          `INSERT INTO workout_days (plan_id, name, day_order) VALUES (?, ?, ?)`,
          [planId, day.name, dayIndex]
        );
        if (day.exercises && day.exercises.length > 0) {
          for (let exIdx = 0; exIdx < day.exercises.length; exIdx++) {
            const ex = day.exercises[exIdx];
            await dbRun(
              `INSERT INTO workout_day_exercises
                (day_id, exercise_id, default_sets, default_reps, default_weight, exercise_order, exercise_type, target_rpe, reps_min, reps_max)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                dayId,
                ex.exercise_id,
                ex.sets,
                ex.reps,
                ex.weight || 0,
                exIdx,
                ex.exercise_type || 'weighted',
                ex.target_rpe || null,
                ex.reps_min || null,
                ex.reps_max || null,
              ]
            );
          }
        }
      }
    }

    await dbRun('COMMIT');
    res.json({ id: planId, message: 'Workout plan created successfully' });
  } catch (err) {
    try {
      await dbRun('ROLLBACK');
    } catch (_) {}
    res.status(400).json({ error: err.message });
  }
};

exports.deletePlan = async (req, res) => {
  try {
    await dbRun(`DELETE FROM workout_plans WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Plan deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ─── Sessions ────────────────────────────────────────────────────────────────

exports.saveSession = async (req, res) => {
  const { day_id, date, notes, logs } = req.body;
  if (!day_id || !date)
    return res.status(400).json({ error: 'day_id and date are required' });

  try {
    await dbRun('BEGIN TRANSACTION');
    const { lastID: sessionId } = await dbRun(
      `INSERT INTO workout_sessions (day_id, date, notes) VALUES (?, ?, ?)`,
      [day_id, date, notes || null]
    );

    if (logs && logs.length > 0) {
      for (const log of logs) {
        const prCheck = await dbAll(
          `SELECT MAX(weight) as max_weight FROM workout_session_logs WHERE exercise_id = ?`,
          [log.exercise_id]
        );
        const prevMax = prCheck[0]?.max_weight ?? 0;
        const isPR = log.weight != null && log.weight > prevMax ? 1 : 0;

        await dbRun(
          `INSERT INTO workout_session_logs
            (session_id, exercise_id, set_number, weight, reps, rpe, notes, duration_seconds, is_pr)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            log.exercise_id,
            log.set_number,
            log.weight ?? null,
            log.reps ?? null,
            log.rpe ?? null,
            log.notes ?? null,
            log.duration_seconds ?? null,
            isPR,
          ]
        );
      }
    }

    await dbRun('COMMIT');
    res.json({ id: sessionId, message: 'Workout session saved successfully' });
  } catch (err) {
    try {
      await dbRun('ROLLBACK');
    } catch (_) {}
    res.status(400).json({ error: err.message });
  }
};

exports.getSessionHistory = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const rows = await dbAll(
      `
      SELECT
        ws.id as session_id, ws.date, ws.notes as session_notes,
        wd.name as day_name,
        wp.name as plan_name,
        wsl.id as log_id, wsl.exercise_id, wsl.set_number,
        wsl.weight, wsl.reps, wsl.rpe, wsl.notes as log_notes,
        wsl.duration_seconds, wsl.is_pr,
        e.name as exercise_name
      FROM workout_sessions ws
      JOIN workout_days wd ON ws.day_id = wd.id
      JOIN workout_plans wp ON wd.plan_id = wp.id
      LEFT JOIN workout_session_logs wsl ON ws.id = wsl.session_id
      LEFT JOIN exercises e ON wsl.exercise_id = e.id
      ORDER BY ws.date DESC, ws.id DESC, wsl.exercise_id, wsl.set_number
    `,
      []
    );

    const sessionsMap = {};
    rows.forEach((row) => {
      if (!sessionsMap[row.session_id]) {
        sessionsMap[row.session_id] = {
          id: row.session_id,
          date: row.date,
          notes: row.session_notes,
          day_name: row.day_name,
          plan_name: row.plan_name,
          logs: [],
        };
      }
      if (row.log_id) {
        sessionsMap[row.session_id].logs.push({
          id: row.log_id,
          exercise_id: row.exercise_id,
          exercise_name: row.exercise_name,
          set_number: row.set_number,
          weight: row.weight,
          reps: row.reps,
          rpe: row.rpe,
          notes: row.log_notes,
          duration_seconds: row.duration_seconds,
          is_pr: row.is_pr,
        });
      }
    });

    res.json(Object.values(sessionsMap).slice(0, parseInt(limit)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getLastSessionForDay = async (req, res) => {
  try {
    const { day_id } = req.params;
    const sessions = await dbAll(
      `SELECT id, date FROM workout_sessions WHERE day_id = ? ORDER BY date DESC LIMIT 1`,
      [day_id]
    );
    if (!sessions.length) return res.json(null);
    const logs = await dbAll(
      `
      SELECT wsl.*, e.name as exercise_name
      FROM workout_session_logs wsl
      JOIN exercises e ON wsl.exercise_id = e.id
      WHERE wsl.session_id = ?
      ORDER BY wsl.exercise_id, wsl.set_number
    `,
      [sessions[0].id]
    );
    res.json({ ...sessions[0], logs });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getExerciseProgress = async (req, res) => {
  try {
    const rows = await dbAll(
      `
      SELECT
        ws.date,
        MAX(wsl.weight) as max_weight,
        MAX(wsl.reps) as max_reps,
        SUM(COALESCE(wsl.weight,0) * COALESCE(wsl.reps,0)) as total_volume,
        COUNT(*) as total_sets,
        MAX(wsl.is_pr) as had_pr
      FROM workout_session_logs wsl
      JOIN workout_sessions ws ON wsl.session_id = ws.id
      WHERE wsl.exercise_id = ?
      GROUP BY ws.id, ws.date
      ORDER BY ws.date ASC
    `,
      [req.params.exercise_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getExerciseSuggestion = async (req, res) => {
  try {
    const { exercise_id } = req.params;
    const { target_reps, target_rpe } = req.query;

    if (!exercise_id)
      return res.status(400).json({ error: 'exercise_id is required' });

    // Get the most recent session for this exercise
    const logs = await dbAll(
      `
      SELECT weight, reps, rpe
      FROM workout_session_logs
      WHERE exercise_id = ?
      AND session_id = (
        SELECT MAX(session_id)
        FROM workout_session_logs
        WHERE exercise_id = ?
      )
      ORDER BY set_number ASC
    `,
      [exercise_id, exercise_id]
    );

    if (!logs.length) {
      return res.json({
        suggestion: null,
        message: 'No previous data found for this exercise',
      });
    }

    // Calculate e1RM for each set and find the max
    let maxE1RM = 0;
    logs.forEach((log) => {
      const e1RM = calculateE1RM(log.weight, log.reps, log.rpe);
      if (e1RM && e1RM > maxE1RM) maxE1RM = e1RM;
    });

    if (maxE1RM === 0) {
      return res.json({
        suggestion: null,
        message: 'Could not calculate e1RM from previous data',
      });
    }

    const tReps = parseInt(target_reps) || 8;
    const tRPE = parseFloat(target_rpe) || 8;

    const suggestedWeightValue = suggestWeight(maxE1RM, tReps, tRPE);

    res.json({
      exercise_id,
      max_e1rm: maxE1RM,
      suggested_weight: suggestedWeightValue
        ? Math.round(suggestedWeightValue * 4) / 4
        : null, // Round to nearest 0.25
      target_reps: tReps,
      target_rpe: tRPE,
      last_session_logs: logs,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const [{ count: totalSessions }] = await dbAll(
      `SELECT COUNT(*) as count FROM workout_sessions`
    );
    const [{ count: totalSets }] = await dbAll(
      `SELECT COUNT(*) as count FROM workout_session_logs`
    );
    const [{ count: totalPRs }] = await dbAll(
      `SELECT COUNT(*) as count FROM workout_session_logs WHERE is_pr = 1`
    );
    const recentPRs = await dbAll(`
      SELECT wsl.exercise_id, e.name, wsl.weight, wsl.reps, ws.date
      FROM workout_session_logs wsl
      JOIN exercises e ON wsl.exercise_id = e.id
      JOIN workout_sessions ws ON wsl.session_id = ws.id
      WHERE wsl.is_pr = 1
      ORDER BY ws.date DESC LIMIT 5
    `);
    const muscleVolume = await dbAll(`
      SELECT e.primary_muscles as muscle, SUM(COALESCE(wsl.weight,0) * COALESCE(wsl.reps,0)) as volume
      FROM workout_session_logs wsl
      JOIN exercises e ON wsl.exercise_id = e.id
      GROUP BY e.primary_muscles
      ORDER BY volume DESC LIMIT 10
    `);
    res.json({ totalSessions, totalSets, totalPRs, recentPRs, muscleVolume });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
