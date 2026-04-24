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
    vo2_max,
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
    vo2_max,
  ];
  const hasAtLeastOneMeasurement = measurements.some(
    (val) => val !== undefined && val !== null && val !== ''
  );

  if (!hasAtLeastOneMeasurement) {
    return res
      .status(400)
      .json({ error: 'At least one measurement is required' });
  }

  const query = `
    INSERT INTO measurements (user_id, date, bodyweight, body_fat, chest, waist, biceps, forearm, calf, thigh, vo2_max)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      bodyweight = COALESCE(excluded.bodyweight, measurements.bodyweight),
      body_fat   = COALESCE(excluded.body_fat,   measurements.body_fat),
      chest      = COALESCE(excluded.chest,      measurements.chest),
      waist      = COALESCE(excluded.waist,      measurements.waist),
      biceps     = COALESCE(excluded.biceps,     measurements.biceps),
      forearm    = COALESCE(excluded.forearm,    measurements.forearm),
      calf       = COALESCE(excluded.calf,       measurements.calf),
      thigh      = COALESCE(excluded.thigh,      measurements.thigh),
      vo2_max    = COALESCE(excluded.vo2_max,    measurements.vo2_max)
  `;
  const params = [
    req.session.user.id,
    date,
    bodyweight || null,
    body_fat || null,
    chest || null,
    waist || null,
    biceps || null,
    forearm || null,
    calf || null,
    thigh || null,
    vo2_max || null,
  ];

  db.run(query, params, function (err) {
    if (err) {
      console.error('[Measurement] Error saving:', err.message);
      return res.status(400).json({ error: err.message });
    }
    res.json({
      id: this.lastID || null,
      message: 'Measurement saved successfully',
    });
  });
};

exports.deleteMeasurement = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id } = req.params;
  const query = `DELETE FROM measurements WHERE id = ? AND user_id = ?`;
  db.run(query, [id, req.session.user.id], function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Measurement deleted successfully' });
  });
};
