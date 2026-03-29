require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import Routes
const measurementRoutes = require('./routes/measurementRoutes');
const photoRoutes = require('./routes/photoRoutes');
const sleepRoutes = require('./routes/sleepRoutes');
const workoutRoutes = require('./routes/workoutRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Mount Routes
app.use('/api/measurements', measurementRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/sleep', sleepRoutes);
app.use('/api/workouts', workoutRoutes);

module.exports = app;
