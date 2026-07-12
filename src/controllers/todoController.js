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

const fetchTaskRewards = (taskId) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM todo_task_rewards WHERE task_id = ?`, [taskId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

const fetchAllTaskRewards = (userId) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT tr.* FROM todo_task_rewards tr JOIN todo_tasks t ON tr.task_id = t.id WHERE t.user_id = ?`, [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

exports.getTasks = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const userId = req.session.user.id;
  const { status } = req.query;

  let query = `SELECT * FROM todo_tasks WHERE user_id = ?`;
  const params = [userId];

  if (status === 'active') {
    query += ` AND completed = 0`;
  } else if (status === 'completed') {
    query += ` AND completed = 1`;
  }

  query += ` ORDER BY completed ASC, priority DESC, due_date ASC`;

  db.all(query, params, async (err, tasks) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const allRewards = await fetchAllTaskRewards(userId);
      const rewardsByTask = {};
      allRewards.forEach((r) => {
        if (!rewardsByTask[r.task_id]) rewardsByTask[r.task_id] = [];
        rewardsByTask[r.task_id].push(r);
      });

      const tasksWithRewards = tasks.map((t) => ({
        ...t,
        rewards: rewardsByTask[t.id] || [],
      }));

      res.json(tasksWithRewards);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};

exports.createTask = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const userId = req.session.user.id;
  const { title, description, xp_reward, priority, start_date, due_date, rewards } = req.body;

  if (!title) return res.status(400).json({ error: 'title is required' });
  if (!rewards || !Array.isArray(rewards) || rewards.length === 0) {
    return res.status(400).json({ error: 'At least one stat reward is required' });
  }

  for (const r of rewards) {
    if (!r.stat_name || !STATS.includes(r.stat_name)) {
      return res.status(400).json({ error: `Invalid stat: ${r.stat_name}` });
    }
    if (!r.bonus || r.bonus < 1) {
      return res.status(400).json({ error: 'Bonus must be at least 1' });
    }
  }

  db.run(
    `INSERT INTO todo_tasks (user_id, title, description, xp_reward, priority, start_date, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, title, description || '', xp_reward || 5, priority || 1, start_date || null, due_date || null],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      const taskId = this.lastID;

      db.serialize(() => {
        rewards.forEach((r) => {
          db.run(
            `INSERT INTO todo_task_rewards (task_id, stat_name, bonus) VALUES (?, ?, ?)`,
            [taskId, r.stat_name, r.bonus]
          );
        });
      });

      res.json({ id: taskId, message: 'Task created' });
    }
  );
};

exports.updateTask = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id } = req.params;
  const { title, description, xp_reward, priority, start_date, due_date, rewards } = req.body;

  db.get(`SELECT * FROM todo_tasks WHERE id = ? AND user_id = ?`, [id, req.session.user.id], (err, task) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const fields = [];
    const params = [];
    if (title !== undefined) { fields.push('title = ?'); params.push(title); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (xp_reward !== undefined) { fields.push('xp_reward = ?'); params.push(xp_reward); }
    if (priority !== undefined) { fields.push('priority = ?'); params.push(priority); }
    if (start_date !== undefined) { fields.push('start_date = ?'); params.push(start_date || null); }
    if (due_date !== undefined) { fields.push('due_date = ?'); params.push(due_date || null); }

    const updateTaskFields = (cb) => {
      if (fields.length > 0) {
        params.push(id, req.session.user.id);
        db.run(`UPDATE todo_tasks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, params, cb);
      } else {
        cb(null);
      }
    };

    const updateRewards = (cb) => {
      if (rewards && Array.isArray(rewards)) {
        db.run(`DELETE FROM todo_task_rewards WHERE task_id = ?`, [id], (err) => {
          if (err) return cb(err);
          if (rewards.length === 0) return cb(null);
          db.serialize(() => {
            let completed = 0;
            rewards.forEach((r) => {
              db.run(
                `INSERT INTO todo_task_rewards (task_id, stat_name, bonus) VALUES (?, ?, ?)`,
                [id, r.stat_name, r.bonus || 1],
                (err) => {
                  if (!err) completed++;
                  if (completed === rewards.length) cb(null);
                }
              );
            });
          });
        });
      } else {
        cb(null);
      }
    };

    updateTaskFields((err) => {
      if (err) return res.status(400).json({ error: err.message });
      updateRewards((err) => {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: 'Task updated' });
      });
    });
  });
};

exports.deleteTask = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id } = req.params;
  db.run(`DELETE FROM todo_tasks WHERE id = ? AND user_id = ?`, [id, req.session.user.id], function (err) {
    if (err) return res.status(400).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted' });
  });
};

exports.completeTask = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const userId = req.session.user.id;
  const { id } = req.params;

  db.get(`SELECT * FROM todo_tasks WHERE id = ? AND user_id = ?`, [id, userId], (err, task) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.completed === 1) return res.status(400).json({ error: 'Task already completed' });

    db.run(
      `UPDATE todo_tasks SET completed = 1, completed_date = date('now') WHERE id = ?`,
      [id],
      (err) => {
        if (err) return res.status(400).json({ error: err.message });

        fetchTaskRewards(id).then((rewards) => {
          const applyRewards = (idx) => {
            if (idx >= rewards.length) {
              const xpGain = task.xp_reward || 5;
              db.run(
                `UPDATE stat_builder_profile SET total_xp = total_xp + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
                [xpGain, userId],
                (err) => {
                  if (err) return res.status(400).json({ error: err.message });

                  db.get(`SELECT * FROM stat_builder_profile WHERE user_id = ?`, [userId], (err, profile) => {
                    if (err) return res.status(400).json({ error: err.message });
                    let leveledUp = false;
                    let newLevel = profile.level;
                    while (profile.total_xp >= xpForLevel(newLevel + 1)) {
                      newLevel++;
                    }
                    if (newLevel > profile.level) {
                      db.run(`UPDATE stat_builder_profile SET level = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [newLevel, userId]);
                      leveledUp = true;
                    }

                    db.all(`SELECT * FROM stat_builder_stats WHERE user_id = ?`, [userId], (err, stats) => {
                      if (err) return res.status(400).json({ error: err.message });
                      res.json({ task: { ...task, completed: 1, completed_date: new Date().toISOString().split('T')[0] }, stats, profile, leveledUp, xpGained: xpGain, message: 'Task completed!' });
                    });
                  });
                }
              );
              return;
            }

            const reward = rewards[idx];
            db.run(
              `UPDATE stat_builder_stats SET value = value + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND stat_name = ?`,
              [reward.bonus, userId, reward.stat_name],
              () => applyRewards(idx + 1)
            );
          };

          applyRewards(0);
        }).catch((e) => res.status(500).json({ error: e.message }));
      }
    );
  });
};

exports.uncompleteTask = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const userId = req.session.user.id;
  const { id } = req.params;

  db.get(`SELECT * FROM todo_tasks WHERE id = ? AND user_id = ?`, [id, userId], (err, task) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.completed === 0) return res.status(400).json({ error: 'Task not yet completed' });

    db.run(
      `UPDATE todo_tasks SET completed = 0, completed_date = NULL WHERE id = ?`,
      [id],
      (err) => {
        if (err) return res.status(400).json({ error: err.message });

        fetchTaskRewards(id).then((rewards) => {
          const undoRewards = (idx) => {
            if (idx >= rewards.length) {
              const xpLoss = task.xp_reward || 5;
              db.run(
                `UPDATE stat_builder_profile SET total_xp = MAX(0, total_xp - ?), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
                [xpLoss, userId],
                (err) => {
                  if (err) return res.status(400).json({ error: err.message });

                  db.all(`SELECT * FROM stat_builder_stats WHERE user_id = ?`, [userId], (err, stats) => {
                    if (err) return res.status(400).json({ error: err.message });
                    db.get(`SELECT * FROM stat_builder_profile WHERE user_id = ?`, [userId], (err, profile) => {
                      if (err) return res.status(400).json({ error: err.message });
                      res.json({ task: { ...task, completed: 0, completed_date: null }, stats, profile, message: 'Completion undone' });
                    });
                  });
                }
              );
              return;
            }

            const reward = rewards[idx];
            db.run(
              `UPDATE stat_builder_stats SET value = MAX(1, value - ?), updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND stat_name = ?`,
              [reward.bonus, userId, reward.stat_name],
              () => undoRewards(idx + 1)
            );
          };

          undoRewards(0);
        }).catch((e) => res.status(500).json({ error: e.message }));
      }
    );
  });
};
