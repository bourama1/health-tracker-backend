const { google } = require('googleapis');
require('dotenv').config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI ||
    'http://localhost:5000/api/auth/google/callback'
);

module.exports = {
  oauth2Client,
  scopes: ['openid', 'profile', 'email'],
};
