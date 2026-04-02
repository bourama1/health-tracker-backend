require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieSession = require('cookie-session');

// Import Routes
const measurementRoutes = require('./routes/measurementRoutes');
const photoRoutes = require('./routes/photoRoutes');
const sleepRoutes = require('./routes/sleepRoutes');
const workoutRoutes = require('./routes/workoutRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// CORS — allow Vercel frontend + local dev
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`[CORS] Blocked origin: ${origin}`);
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

// Session configuration
const isProd = process.env.NODE_ENV === 'production';
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_KEY || 'secret-key'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  sameSite: isProd ? 'none' : 'lax',
  secure: isProd,
  httpOnly: true
}));

// Test-only middleware to mock authentication
if (process.env.NODE_ENV === 'test') {
  app.use((req, res, next) => {
    req.session = req.session || {};
    req.session.user = { id: 'test-user-id', name: 'Test User' };
    next();
  });
}

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(
  '/test-uploads',
  express.static(path.join(__dirname, '../test-uploads'))
);

// Mount Routes
app.use('/api/measurements', measurementRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/sleep', sleepRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/auth', authRoutes);

module.exports = app;
