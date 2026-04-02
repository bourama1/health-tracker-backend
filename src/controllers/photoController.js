const db = require('../config/db');
const { google } = require('googleapis');
const axios = require('axios');

// Helper to get authorized axios instance with refresh logic
const getPhotosClient = async (req) => {
  if (!req.session || !req.session.tokens) {
    throw new Error('No tokens in session');
  }

  // Use a fresh client for every request to be thread-safe
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
  );

  client.setCredentials(req.session.tokens);

  // Check if token is expired and refresh if necessary
  const now = Date.now();
  const expiryDate = req.session.tokens.expiry_date;
  
  if (expiryDate && (expiryDate - now < 300000)) { // Refresh if less than 5 minutes left
    try {
      console.log('[Google Auth] Refreshing access token...');
      const { tokens } = await client.refreshAccessToken();
      // Merge tokens to preserve refresh_token
      req.session.tokens = { ...req.session.tokens, ...tokens };
      client.setCredentials(req.session.tokens);
      console.log('[Google Auth] Token refreshed successfully');
    } catch (error) {
      console.error('[Google Auth] Error refreshing access token:', error.message);
      throw error;
    }
  }

  const currentTokens = client.credentials;

  return axios.create({
    baseURL: 'https://photoslibrary.googleapis.com/v1',
    headers: {
      Authorization: `Bearer ${currentTokens.access_token}`,
      'Content-Type': 'application/json'
    }
  });
};

// List user's Google Photos
exports.listGooglePhotos = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!req.session || !req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }

  try {
    const client = await getPhotosClient(req);
    console.log('[Google Photos] Active scopes in session:', req.session.tokens.scope);
    console.log('[Google Photos] Fetching media items...');
    const response = await client.get('/mediaItems', {
      params: { pageSize: 50 }
    });
    res.json(response.data);
  } catch (error) {
    const googleError = error.response?.data || error.message;
    console.error('[Google Photos] Error listing media items:', JSON.stringify(googleError));
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || 'Failed to list Google Photos';
    res.status(status).json({ 
      error: message,
      details: error.response?.data?.error || null
    });
  }
};

exports.savePhotos = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { date, front_google_id, side_google_id, back_google_id } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required' });

  db.get('SELECT * FROM photos WHERE user_id = ? AND date = ?', [req.session.user.id, date], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });

    if (row) {
      // Update
      const query = `
        UPDATE photos
        SET front_google_id = COALESCE(?, front_google_id),
            side_google_id = COALESCE(?, side_google_id),
            back_google_id = COALESCE(?, back_google_id)
        WHERE user_id = ? AND date = ?
      `;
      db.run(query, [front_google_id, side_google_id, back_google_id, req.session.user.id, date], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: 'Photos updated successfully' });
      });
    } else {
      // Insert
      const query = `
        INSERT INTO photos (user_id, date, front_google_id, side_google_id, back_google_id)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(query, [req.session.user.id, date, front_google_id, side_google_id, back_google_id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: 'Photos saved successfully' });
      });
    }
  });
};

exports.getPhotosByDate = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { date } = req.params;
  const query = `SELECT * FROM photos WHERE user_id = ? AND date = ?`;
  
  db.get(query, [req.session.user.id, date], async (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!row) return res.json({});

    // If we have Google IDs, we need to fetch fresh baseUrls
    if (row.front_google_id || row.side_google_id || row.back_google_id) {
      if (!req.session || !req.session.tokens) {
        // Return without URLs if not logged in to Google
        return res.json(row);
      }

      try {
        const client = await getPhotosClient(req);
        const ids = [row.front_google_id, row.side_google_id, row.back_google_id].filter(Boolean);
        
        // Fetch media items details
        const response = await client.post('/mediaItems:batchGet', {
          mediaItemIds: ids
        });

        const mediaItems = response.data.mediaItemResults || [];
        const result = { ...row };

        mediaItems.forEach(itemResult => {
          const item = itemResult.mediaItem;
          if (!item) return;

          if (item.id === row.front_google_id) result.front_path = item.baseUrl;
          if (item.id === row.side_google_id) result.side_path = item.baseUrl;
          if (item.id === row.back_google_id) result.back_path = item.baseUrl;
        });

        res.json(result);
      } catch (error) {
        console.error('Error fetching Google Photo details:', error.response?.data || error.message);
        res.json(row); // Return row without fresh URLs
      }
    } else {
      res.json(row);
    }
  });
};

exports.getAllPhotoDates = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const query = `SELECT date FROM photos WHERE user_id = ? ORDER BY date DESC`;
  db.all(query, [req.session.user.id], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};

// No-op middleware since we're not using Multer anymore
exports.uploadMiddleware = (req, res, next) => next();
