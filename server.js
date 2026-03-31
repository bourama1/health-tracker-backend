const app = require('./src/app');
const seedExercises = require('./src/scripts/seedExercises');
const PORT = process.env.PORT || 5000;

// Start Server
app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);

  // Automated Exercise Seeding
  try {
    console.log('Running initial exercise seed...');
    await seedExercises();

    // Schedule weekly updates (every 7 days)
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    setInterval(async () => {
      console.log('Running scheduled weekly exercise update...');
      try {
        await seedExercises();
      } catch (err) {
        console.error('Scheduled seed failed:', err);
      }
    }, SEVEN_DAYS_MS);
  } catch (err) {
    console.error('Initial exercise seed failed:', err);
  }
});
