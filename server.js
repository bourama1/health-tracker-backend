require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import Routes
const measurementRoutes = require('./src/routes/measurementRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount Routes
app.use('/api/measurements', measurementRoutes);

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
