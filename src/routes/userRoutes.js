const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/settings', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  db.get(`SELECT mfp_username FROM users WHERE id = ?`, [req.session.user.id], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ mfp_username: row?.mfp_username || '' });
  });
});

router.patch('/mfp-username', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const { mfp_username } = req.body;
  if (mfp_username === undefined) return res.status(400).json({ error: 'mfp_username required' });
  db.run(`UPDATE users SET mfp_username = ? WHERE id = ?`, [mfp_username, req.session.user.id], (err) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ mfp_username });
  });
});

module.exports = router;
