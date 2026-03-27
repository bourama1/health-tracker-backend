const db = require('../config/db');

exports.getAllMeasurements = (req, res) => {
  const query = `SELECT * FROM measurements ORDER BY date DESC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};

exports.createMeasurement = (req, res) => {
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

  const query = `INSERT INTO measurements (date, bodyweight, body_fat, chest, waist, biceps, forearm, calf, thigh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
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
