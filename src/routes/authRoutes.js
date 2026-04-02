const express = require('express');
const router = express.Router();
const { oauth2Client, scopes } = require('../config/googleConfig');

// Redirect to Google login
router.get('/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  res.redirect(url);
});

// Google login callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  try {
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens;
    res.redirect(`${frontendUrl}/photos?auth=success`);
  } catch (error) {
    console.error('Error during Google Auth callback:', error);
    res.redirect(`${frontendUrl}/photos?auth=failure`);
  }
});

// Check auth status
router.get('/status', (req, res) => {
  if (req.session && req.session.tokens) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

module.exports = router;
