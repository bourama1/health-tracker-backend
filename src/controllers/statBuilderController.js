const db = require('../config/db');

const STATS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

const xpForLevel = (lvl) => {
  if (lvl <= 1) return 0;
  let total = 0, inc = 150;
  for (let i = 2; i <= lvl; i++) {
    total += inc;
    inc = Math.floor(inc * 1.4);
  }
  return total;
};

const getUserOrCreate = (req, res, callback) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const userId = req.session.user.id;
  db.run(`INSERT OR IGNORE INTO stat_builder_profile (user_id) VALUES (?)`, [userId], (err) => {
    if (err) return res.status(400).json({ error: err.message });
    db.run(`INSERT OR IGNORE INTO stat_builder_stats (user_id, stat_name, value) VALUES (?, 'strength', 1), (?, 'dexterity', 1), (?, 'constitution', 1), (?, 'intelligence', 1), (?, 'wisdom', 1), (?, 'charisma', 1)`, [userId, userId, userId, userId, userId, userId], (err) => {
      if (err) return res.status(400).json({ error: err.message });
      callback(userId);
    });
  });
};

exports.getData = (req, res) => {
  getUserOrCreate(req, res, (userId) => {
    let profile, stats, skills, unlocks;
    db.get(`SELECT * FROM stat_builder_profile WHERE user_id = ?`, [userId], (err, row) => {
      if (err) return res.status(400).json({ error: err.message });
      profile = row;

      db.all(`SELECT * FROM stat_builder_stats WHERE user_id = ?`, [userId], (err, rows) => {
        if (err) return res.status(400).json({ error: err.message });
        stats = rows;

        db.all(`SELECT * FROM stat_builder_skills WHERE user_id = ? AND active = 1 ORDER BY stat_name, order_index`, [userId], (err, rows) => {
          if (err) return res.status(400).json({ error: err.message });
          skills = rows;

          db.all(`SELECT * FROM stat_builder_unlocks WHERE user_id = ? ORDER BY xp_threshold`, [userId], (err, rows) => {
            if (err) return res.status(400).json({ error: err.message });
            unlocks = rows;

            res.json({ profile, stats, skills, unlocks });
          });
        });
      });
    });
  });
};

exports.updateStats = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { stats } = req.body;
  if (!stats || typeof stats !== 'object') return res.status(400).json({ error: 'stats object required' });

  let completed = 0;
  const keys = Object.keys(stats);
  if (keys.length === 0) return res.json({ message: 'No stats to update' });

  db.serialize(() => {
    keys.forEach((statName) => {
      const val = Math.max(1, Math.min(100, parseInt(stats[statName]) || 1));
      db.run(`INSERT INTO stat_builder_stats (user_id, stat_name, value) VALUES (?, ?, ?) ON CONFLICT(user_id, stat_name) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`, [req.session.user.id, statName, val, val], (err) => {
        if (!err) completed++;
      });
    });
  });

  res.json({ message: `${completed} stats updated` });
};

exports.createSkill = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { stat_name, name, difficulty } = req.body;
  if (!stat_name || !name) return res.status(400).json({ error: 'stat_name and name required' });
  if (!STATS.includes(stat_name)) return res.status(400).json({ error: `Invalid stat: ${stat_name}` });

  db.get(`SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM stat_builder_skills WHERE user_id = ? AND stat_name = ?`, [req.session.user.id, stat_name], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    const order = row.next_order;
    db.run(`INSERT INTO stat_builder_skills (user_id, stat_name, name, difficulty, order_index) VALUES (?, ?, ?, ?, ?)`, [req.session.user.id, stat_name, name, difficulty || 1, order], function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Skill created' });
    });
  });
};

exports.updateSkill = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id } = req.params;
  const { name, difficulty, stat_name, order_index, active } = req.body;

  const fields = [];
  const params = [];
  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (difficulty !== undefined) { fields.push('difficulty = ?'); params.push(difficulty); }
  if (stat_name !== undefined) { fields.push('stat_name = ?'); params.push(stat_name); }
  if (order_index !== undefined) { fields.push('order_index = ?'); params.push(order_index); }
  if (active !== undefined) { fields.push('active = ?'); params.push(active); }
  fields.push("updated_at = CURRENT_TIMESTAMP");

  if (fields.length === 1) return res.status(400).json({ error: 'No fields to update' });

  params.push(id, req.session.user.id);
  db.run(`UPDATE stat_builder_skills SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, params, function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Skill updated' });
  });
};

exports.deleteSkill = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id } = req.params;
  db.run(`UPDATE stat_builder_skills SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, [id, req.session.user.id], function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Skill deleted' });
  });
};

exports.toggleLog = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { skill_id, date } = req.body;
  if (!skill_id || !date) return res.status(400).json({ error: 'skill_id and date required' });

  db.get(`SELECT * FROM stat_builder_skills WHERE id = ? AND user_id = ?`, [skill_id, req.session.user.id], (err, skill) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!skill) return res.status(404).json({ error: 'Skill not found' });

    const applyXpAndRespond = (newCompleted, logId) => {
      const xpDelta = newCompleted ? skill.difficulty : -skill.difficulty;

      const finish = () => {
        db.all(`SELECT * FROM stat_builder_stats WHERE user_id = ?`, [req.session.user.id], (err, stats) => {
          if (err) return res.status(400).json({ error: err.message });
          db.get(`SELECT * FROM stat_builder_profile WHERE user_id = ?`, [req.session.user.id], (err, profile) => {
            if (err) return res.status(400).json({ error: err.message });
            let leveledUp = false;
            if (newCompleted) {
              let newLevel = profile.level;
              while (profile.total_xp >= xpForLevel(newLevel + 1)) {
                newLevel++;
              }
              if (newLevel > profile.level) {
                db.run(`UPDATE stat_builder_profile SET level = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [newLevel, req.session.user.id]);
                profile.level = newLevel;
                leveledUp = true;
              }
            }
            res.json({ id: logId, completed: newCompleted, stats, profile, leveledUp, message: newCompleted ? 'Logged' : 'Log toggled' });
          });
        });
      };

      if (xpDelta !== 0) {
        db.run(`UPDATE stat_builder_stats SET value = MAX(1, value + ?), updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND stat_name = ?`, [xpDelta, req.session.user.id, skill.stat_name], () => {
          db.run(`UPDATE stat_builder_profile SET total_xp = MAX(0, total_xp + ?), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [xpDelta, req.session.user.id], finish);
        });
      } else {
        finish();
      }
    };

    db.get(`SELECT * FROM stat_builder_logs WHERE skill_id = ? AND date = ?`, [skill_id, date], (err, existing) => {
      if (err) return res.status(400).json({ error: err.message });
      if (existing) {
        const newCompleted = existing.completed === 1 ? 0 : 1;
        db.run(`UPDATE stat_builder_logs SET completed = ? WHERE id = ?`, [newCompleted, existing.id], function (err) {
          if (err) return res.status(400).json({ error: err.message });
          applyXpAndRespond(newCompleted, existing.id);
        });
      } else {
        db.run(`INSERT INTO stat_builder_logs (user_id, skill_id, date, completed) VALUES (?, ?, ?, 1)`, [req.session.user.id, skill_id, date], function (err) {
          if (err) return res.status(400).json({ error: err.message });
          applyXpAndRespond(1, this.lastID);
        });
      }
    });
  });
};

exports.getLogs = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { from, to } = req.query;
  let query = `SELECT sl.*, ss.stat_name, ss.name as skill_name, ss.difficulty FROM stat_builder_logs sl JOIN stat_builder_skills ss ON sl.skill_id = ss.id WHERE sl.user_id = ?`;
  const params = [req.session.user.id];

  if (from && to) {
    query += ` AND sl.date >= ? AND sl.date <= ?`;
    params.push(from, to);
  }

  query += ` ORDER BY sl.date, ss.order_index`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};

exports.calculateWeek = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });

  db.all(`SELECT sl.skill_id, ss.stat_name, ss.difficulty, COUNT(*) as completions FROM stat_builder_logs sl JOIN stat_builder_skills ss ON sl.skill_id = ss.id WHERE sl.user_id = ? AND sl.date >= ? AND sl.date <= ? AND sl.completed = 1 GROUP BY sl.skill_id`, [req.session.user.id, from, to], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });

    const statXp = {};
    STATS.forEach((s) => statXp[s] = 0);
    let totalWeekXp = 0;

    rows.forEach((row) => {
      const xp = row.completions * row.difficulty;
      statXp[row.stat_name] = (statXp[row.stat_name] || 0) + xp;
      totalWeekXp += xp;
    });

    db.serialize(() => {
      STATS.forEach((stat) => {
        const xp = statXp[stat] || 0;
        db.run(`UPDATE stat_builder_stats SET value = value + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND stat_name = ?`, [xp, req.session.user.id, stat]);
      });

      db.run(`UPDATE stat_builder_profile SET total_xp = total_xp + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [totalWeekXp, req.session.user.id]);

      db.get(`SELECT * FROM stat_builder_profile WHERE user_id = ?`, [req.session.user.id], (err, profile) => {
        if (err) return res.status(400).json({ error: err.message });
        let leveledUp = false;
        let newLevel = profile.level;
        while (profile.total_xp >= xpForLevel(newLevel + 1)) {
          newLevel++;
        }
        if (newLevel > profile.level) {
          db.run(`UPDATE stat_builder_profile SET level = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [newLevel, req.session.user.id]);
          leveledUp = true;
        }
        res.json({ statXp, totalWeekXp, leveledUp, newTotalXp: profile.total_xp });
      });
    });
  });
};

exports.setUnlock = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { xp_threshold, reward_text } = req.body;
  if (!xp_threshold) return res.status(400).json({ error: 'xp_threshold required' });

  db.get(`SELECT id FROM stat_builder_unlocks WHERE user_id = ?`, [req.session.user.id], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    if (row) {
      db.run(`UPDATE stat_builder_unlocks SET xp_threshold = ?, reward_text = ? WHERE user_id = ?`,
        [xp_threshold, reward_text || '', req.session.user.id],
        function (err) {
          if (err) return res.status(400).json({ error: err.message });
          res.json({ message: 'Unlock updated' });
        }
      );
    } else {
      db.run(`INSERT INTO stat_builder_unlocks (user_id, xp_threshold, reward_text) VALUES (?, ?, ?)`,
        [req.session.user.id, xp_threshold, reward_text || ''],
        function (err) {
          if (err) return res.status(400).json({ error: err.message });
          res.json({ message: 'Unlock created' });
        }
      );
    }
  });
};

exports.resetWeek = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  db.run(`DELETE FROM stat_builder_logs WHERE user_id = ?`, [req.session.user.id], function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Week reset, logs cleared' });
  });
};
