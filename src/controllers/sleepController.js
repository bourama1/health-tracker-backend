const db = require('../config/db');
const { calculateSleepScore } = require('../utils/sleepScore');

exports.getAllSleep = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const query = `SELECT * FROM sleep WHERE user_id = ? ORDER BY date DESC`;
  db.all(query, [req.session.user.id], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};

exports.createSleep = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const {
    date,
    bedtime,
    wake_time,
    rhr,
    deep_sleep_minutes,
    rem_sleep_minutes,
    light_minutes,
    awake_minutes,
  } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const query = `INSERT INTO sleep (user_id, date, bedtime, wake_time, rhr, deep_sleep_minutes, rem_sleep_minutes, light_minutes, awake_minutes) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(user_id, date) DO UPDATE SET
                 bedtime=excluded.bedtime,
                 wake_time=excluded.wake_time,
                 rhr=excluded.rhr,
                 deep_sleep_minutes=excluded.deep_sleep_minutes,
                 rem_sleep_minutes=excluded.rem_sleep_minutes,
                 light_minutes=excluded.light_minutes,
                 awake_minutes=excluded.awake_minutes`;

  const params = [
    req.session.user.id,
    date,
    bedtime,
    wake_time,
    rhr,
    deep_sleep_minutes,
    rem_sleep_minutes,
    light_minutes,
    awake_minutes,
  ];

  db.run(query, params, function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Sleep data saved successfully' });
  });
};

exports.deleteSleep = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id } = req.params;
  const query = `DELETE FROM sleep WHERE id = ? AND user_id = ?`;

  db.run(query, [id, req.session.user.id], function (err) {
    if (err) return res.status(400).json({ error: err.message });
    if (this.changes === 0)
      return res.status(404).json({ error: 'Entry not found' });
    res.json({ message: 'Sleep entry deleted successfully' });
  });
};
