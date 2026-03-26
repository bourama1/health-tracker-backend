const db = require('../config/db');

exports.getAllMeasurements = (req, res) => {
  const query = `SELECT * FROM measurements ORDER BY date DESC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};

exports.createMeasurement = (req, res) => {
  const { date, bodyweight, body_fat, chest, waist, biceps } = req.body;
  const query = `INSERT INTO measurements (date, bodyweight, body_fat, chest, waist, biceps) VALUES (?, ?, ?, ?, ?, ?)`;
  const params = [date, bodyweight, body_fat, chest, waist, biceps];

  db.run(query, params, function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Measurement saved successfully' });
  });
};
