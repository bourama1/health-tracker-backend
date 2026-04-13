const express = require('express');
const router = express.Router();
const { scopes } = require('../config/googleConfig');
const { google } = require('googleapis');

// Helper to get a fresh OAuth2 client
const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:5000/api/auth/google/callback'
  );
};
// Redirect to Google login
router.get('/google', (req, res) => {
  const { platform, redirect } = req.query;

  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: JSON.stringify({ platform, redirect }), // Use JSON in state to pass multiple params
  });
  res.redirect(url);
});

// Google login callback
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const oauth2Client = getOAuth2Client();

  let stateData = {};
  try {
    stateData = JSON.parse(state || '{}');
  } catch (e) {
    stateData = { platform: state }; // Fallback for old simple state
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user profile info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    req.session.tokens = tokens;
    req.session.user = {
      id: userInfo.data.id,
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture,
    };

    // If platform was 'mobile', redirect to the provided redirect URL or default
    if (stateData.platform === 'mobile') {
      const mobileRedirect = stateData.redirect || 'healthtrackermobile://auth';
      const token = tokens.access_token;
      console.log('[Auth] Redirecting back to mobile with token');
      return res.redirect(
        `${mobileRedirect}${mobileRedirect.includes('?') ? '&' : '?'}status=success&token=${token}`
      );
    }

    const token = tokens.access_token;
    res.redirect(`${frontendUrl}/?auth=success&token=${token}`);
  } catch (error) {
    console.error('Error during Google Auth callback:', error);
    if (stateData.platform === 'mobile') {
      const mobileRedirect = stateData.redirect || 'healthtrackermobile://auth';
      return res.redirect(
        `${mobileRedirect}${mobileRedirect.includes('?') ? '&' : '?'}status=failure`
      );
    }
    res.redirect(`${frontendUrl}/?auth=failure`);
  }
});

// Check auth status
router.post('/google/verify', async (req, res) => {
  const { access_token, tokens } = req.body;
  if (!access_token && (!tokens || !tokens.access_token)) {
    return res.status(400).json({ error: 'Access token is required' });
  }

  const tokenToUse = access_token || tokens.access_token;

  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ access_token: tokenToUse });

    // Fetch user profile info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    req.session.tokens = tokens || { access_token: tokenToUse };
    req.session.user = {
      id: userInfo.data.id,
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture,
    };

    res.json({ authenticated: true, user: req.session.user });
  } catch (error) {
    console.error('Error verifying Google token:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

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
