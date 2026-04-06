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
const fitRoutes = require('./routes/fitRoutes');

const app = express();

// Trust Render's (and any other PaaS) reverse proxy so that
// req.secure is true and secure cookies are set correctly over HTTPS
app.set('trust proxy', 1);

// Middleware
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      frontendUrl,
      'http://localhost:3000',
      'https://health-tracker-cenc.onrender.com',
    ];

    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      process.env.NODE_ENV !== 'production'
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(
  cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'health-tracker-secret'],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
);

// Bypass authentication for tests
if (process.env.NODE_ENV === 'test') {
  app.use((req, res, next) => {
    req.session.user = { id: 'test-user-id', email: 'test@example.com' };
    req.session.tokens = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
    };
    next();
  });
}

// Serve uploaded photos statically (for local development if still needed)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Simple request logger
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});

// Mount Routes
app.use('/api/measurements', measurementRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/sleep', sleepRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/fit', fitRoutes);

module.exports = app;
