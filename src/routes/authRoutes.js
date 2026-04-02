const express = require('express');
const router = express.Router();
const { scopes } = require('../config/googleConfig');
const { google } = require('googleapis');

// Helper to get a fresh OAuth2 client
const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
  );
};

// Redirect to Google login
router.get('/google', (req, res) => {
  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    include_granted_scopes: true
  });
  res.redirect(url);
});

// Google login callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const oauth2Client = getOAuth2Client();
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user profile info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    console.log('[Google Auth] Granted scopes:', tokens.scope);
    req.session.tokens = tokens;
    req.session.user = {
      id: userInfo.data.id,
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture
    };

    // Redirect to root, frontend will handle view
    res.redirect(`${frontendUrl}/?auth=success`);
  } catch (error) {
    console.error('Error during Google Auth callback:', error);
    res.redirect(`${frontendUrl}/?auth=failure`);
  }
});

// Check auth status
router.get('/status', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
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
