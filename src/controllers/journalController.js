const db = require('../config/db');

exports.getEntry = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { date } = req.params;
  db.get(`SELECT * FROM journal_entries WHERE user_id = ? AND date = ?`, [req.session.user.id, date], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(row || {});
  });
};

exports.saveEntry = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { date, prompt1, prompt2, prompt3, prompt4 } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required' });

  db.run(`INSERT INTO journal_entries (user_id, date, prompt1, prompt2, prompt3, prompt4) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        prompt1 = COALESCE(excluded.prompt1, journal_entries.prompt1),
        prompt2 = COALESCE(excluded.prompt2, journal_entries.prompt2),
        prompt3 = COALESCE(excluded.prompt3, journal_entries.prompt3),
        prompt4 = COALESCE(excluded.prompt4, journal_entries.prompt4),
        updated_at = CURRENT_TIMESTAMP`,
    [req.session.user.id, date, prompt1 || '', prompt2 || '', prompt3 || '', prompt4 || ''],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ message: 'Journal entry saved' });
    }
  );
};

exports.getAllEntries = (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  db.all(`SELECT * FROM journal_entries WHERE user_id = ? ORDER BY date DESC`, [req.session.user.id], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};
