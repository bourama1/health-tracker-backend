const db = require('../config/db');

exports.getAllMeasurements = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const query = `SELECT * FROM measurements WHERE user_id = ? ORDER BY date DESC`;
  db.all(query, [req.session.user.id], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};

exports.createMeasurement = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const {
    date,
    bodyweight,
    body_fat,
    chest,
    waist,
    biceps,
    forearm,
    calf,
    thigh,
  } = req.body;

  // Validation: Every measurement needs to have date and at least one other measurement
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const measurements = [
    bodyweight,
    body_fat,
    chest,
    waist,
    biceps,
    forearm,
    calf,
    thigh,
  ];
  const hasAtLeastOneMeasurement = measurements.some(
    (val) => val !== undefined && val !== null && val !== ''
  );

  if (!hasAtLeastOneMeasurement) {
    return res
      .status(400)
      .json({ error: 'At least one measurement is required' });
  }

  const query = `INSERT INTO measurements (user_id, date, bodyweight, body_fat, chest, waist, biceps, forearm, calf, thigh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
    req.session.user.id,
    date,
    bodyweight,
    body_fat,
    chest,
    waist,
    biceps,
    forearm,
    calf,
    thigh,
  ];

  db.run(query, params, function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Measurement saved successfully' });
  });
};
