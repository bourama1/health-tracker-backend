const db = require('../config/db');

exports.getActivity = async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userId = req.session.user.id;

  try {
    const rows = await db.all(
      'SELECT * FROM activity WHERE user_id = ? ORDER BY date DESC',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[ActivityController] Error fetching activity:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
};

exports.saveActivity = async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userId = req.session.user.id;
  const { date, steps } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  try {
    const sql = `
      INSERT INTO activity (user_id, date, steps)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        steps = excluded.steps
    `;
    await db.run(sql, [userId, date, steps || null]);
    res.json({ message: 'Activity saved successfully' });
  } catch (err) {
    console.error('[ActivityController] Error saving activity:', err);
    res.status(500).json({ error: 'Failed to save activity' });
  }
};
