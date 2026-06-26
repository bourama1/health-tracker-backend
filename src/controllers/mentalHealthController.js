const db = require('../config/db');

exports.getAllEntries = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const query = `SELECT * FROM mental_health WHERE user_id = ? ORDER BY date DESC`;
  db.all(query, [req.session.user.id], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};

exports.createEntry = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { date, energy, mood, composure, physicality, connectivity, notes } =
    req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const query = `
    INSERT INTO mental_health (user_id, date, energy, mood, composure, physicality, connectivity, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      energy = COALESCE(excluded.energy, mental_health.energy),
      mood = COALESCE(excluded.mood, mental_health.mood),
      composure = COALESCE(excluded.composure, mental_health.composure),
      physicality = COALESCE(excluded.physicality, mental_health.physicality),
      connectivity = COALESCE(excluded.connectivity, mental_health.connectivity),
      notes = COALESCE(excluded.notes, mental_health.notes)
  `;
  const params = [
    req.session.user.id,
    date,
    energy ?? null,
    mood ?? null,
    composure ?? null,
    physicality ?? null,
    connectivity ?? null,
    notes ?? null,
  ];

  db.run(query, params, function (err) {
    if (err) {
      console.error('[MentalHealth] Error saving:', err.message);
      return res.status(400).json({ error: err.message });
    }
    res.json({
      id: this.lastID || null,
      message: 'Mental health entry saved successfully',
    });
  });
};

exports.deleteEntry = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id } = req.params;
  const query = `DELETE FROM mental_health WHERE id = ? AND user_id = ?`;
  db.run(query, [id, req.session.user.id], function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ message: 'Mental health entry deleted successfully' });
  });
};
