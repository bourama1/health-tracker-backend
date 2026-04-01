const db = require('../config/db');
const { oauth2Client } = require('../config/googleConfig');
const axios = require('axios');

// Helper to get authorized axios instance
const getPhotosClient = (tokens) => {
  return axios.create({
    baseURL: 'https://photoslibrary.googleapis.com/v1',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json'
    }
  });
};

// List user's Google Photos
exports.listGooglePhotos = async (req, res) => {
  if (!req.session || !req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }

  try {
    const client = getPhotosClient(req.session.tokens);
    const response = await client.get('/mediaItems', {
      params: { pageSize: 50 }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error listing Google Photos:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to list Google Photos' });
  }
};

exports.savePhotos = (req, res) => {
  const { date, front_google_id, side_google_id, back_google_id } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required' });

  db.get('SELECT * FROM photos WHERE date = ?', [date], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });

    if (row) {
      // Update
      const query = `
        UPDATE photos
        SET front_google_id = COALESCE(?, front_google_id),
            side_google_id = COALESCE(?, side_google_id),
            back_google_id = COALESCE(?, back_google_id)
        WHERE date = ?
      `;
      db.run(query, [front_google_id, side_google_id, back_google_id, date], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: 'Photos updated successfully' });
      });
    } else {
      // Insert
      const query = `
        INSERT INTO photos (date, front_google_id, side_google_id, back_google_id)
        VALUES (?, ?, ?, ?)
      `;
      db.run(query, [date, front_google_id, side_google_id, back_google_id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: 'Photos saved successfully' });
      });
    }
  });
};

exports.getPhotosByDate = async (req, res) => {
  const { date } = req.params;
  const query = `SELECT * FROM photos WHERE date = ?`;
  
  db.get(query, [date], async (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!row) return res.json({});

    // If we have Google IDs, we need to fetch fresh baseUrls
    if (row.front_google_id || row.side_google_id || row.back_google_id) {
      if (!req.session || !req.session.tokens) {
        // Return without URLs if not logged in
        return res.json(row);
      }

      try {
        const client = getPhotosClient(req.session.tokens);
        const ids = [row.front_google_id, row.side_google_id, row.back_google_id].filter(Boolean);
        
        // Fetch media items details
        // Note: batchesGet only supports up to 50 IDs
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
  const query = `SELECT date FROM photos ORDER BY date DESC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};

// No-op middleware since we're not using Multer anymore
exports.uploadMiddleware = (req, res, next) => next();
