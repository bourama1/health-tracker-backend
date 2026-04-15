const { oauth2Client } = require('../config/googleConfig');
const db = require('../config/db');

/**
 * Saves or updates user tokens in the database.
 */
const saveUserTokens = async (userId, tokens, userInfo = {}) => {
  const { access_token, refresh_token, expiry_date } = tokens;
  const { email, name, picture } = userInfo;

  // Use COALESCE to keep existing refresh_token if not provided in this update
  // (Google only sends refresh_token on the first authorization or when prompt=consent)
  const upsertSql = `
    INSERT INTO users (id, email, name, picture, access_token, refresh_token, expiry_date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      email = COALESCE(excluded.email, users.email),
      name = COALESCE(excluded.name, users.name),
      picture = COALESCE(excluded.picture, users.picture),
      access_token = COALESCE(excluded.access_token, users.access_token),
      refresh_token = COALESCE(excluded.refresh_token, users.refresh_token),
      expiry_date = COALESCE(excluded.expiry_date, users.expiry_date),
      updated_at = CURRENT_TIMESTAMP
  `;

  return db.run(upsertSql, [
    userId,
    email || null,
    name || null,
    picture || null,
    access_token,
    refresh_token || null,
    expiry_date || null,
  ]);
};

/**
 * Gets a valid OAuth2 client for a user, refreshing the access token if needed.
 */
const getValidClient = async (userId) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    throw new Error('User not found');
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
  );

  const tokens = {
    access_token: user.access_token,
    refresh_token: user.refresh_token,
    expiry_date: user.expiry_date,
  };

  client.setCredentials(tokens);

  // Check if token is expired (or expires in the next 5 minutes)
  const isExpired = user.expiry_date ? (user.expiry_date <= (Date.now() + 300000)) : true;

  if (isExpired && user.refresh_token) {
    console.log(`[TokenManager] Refreshing token for user ${userId}...`);
    try {
      const { tokens: newTokens } = await client.refreshToken(user.refresh_token);
      await saveUserTokens(userId, newTokens);
      client.setCredentials(newTokens);
    } catch (error) {
      console.error(`[TokenManager] Failed to refresh token for user ${userId}:`, error.message);
      throw error;
    }
  } else if (isExpired && !user.refresh_token) {
    throw new Error('Access token expired and no refresh token available');
  }

  return client;
};

const { google } = require('googleapis');

module.exports = {
  saveUserTokens,
  getValidClient,
};
