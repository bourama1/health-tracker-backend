const db = require('../config/db');

exports.getAllSleep = (req, res) => {
  const query = `SELECT * FROM sleep ORDER BY date DESC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};

exports.createSleep = (req, res) => {
  const {
    date,
    bedtime,
    wake_time,
    rhr,
    sleep_score,
    deep_sleep_minutes,
    rem_sleep_minutes,
  } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const query = `INSERT INTO sleep (date, bedtime, wake_time, rhr, sleep_score, deep_sleep_minutes, rem_sleep_minutes) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(date) DO UPDATE SET
                 bedtime=excluded.bedtime,
                 wake_time=excluded.wake_time,
                 rhr=excluded.rhr,
                 sleep_score=excluded.sleep_score,
                 deep_sleep_minutes=excluded.deep_sleep_minutes,
                 rem_sleep_minutes=excluded.rem_sleep_minutes`;

  const params = [
    date,
    bedtime,
    wake_time,
    rhr,
    sleep_score,
    deep_sleep_minutes,
    rem_sleep_minutes,
  ];

  db.run(query, params, function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Sleep data saved successfully' });
  });
};
