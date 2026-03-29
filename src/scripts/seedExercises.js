const https = require('https');
const db = require('../config/db');

const EXERCISES_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

const fetchExercises = () => {
  return new Promise((resolve, reject) => {
    https
      .get(EXERCISES_URL, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
};

const seedExercises = async () => {
  try {
    console.log('Fetching exercises from GitHub...');
    const exercises = await fetchExercises();
    console.log(`Fetched ${exercises.length} exercises. Seeding...`);

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO exercises (id, name, category, equipment, primary_muscles)
      VALUES (?, ?, ?, ?, ?)
    `);

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      for (const exercise of exercises) {
        stmt.run(
          exercise.id,
          exercise.name,
          exercise.category,
          exercise.equipment,
          exercise.primaryMuscles.join(', ')
        );
      }
      db.run('COMMIT', (err) => {
        if (err) {
          console.error('Error committing transaction:', err);
        } else {
          console.log('Successfully seeded exercises!');
        }
      });
    });

    stmt.finalize();
  } catch (error) {
    console.error('Error seeding exercises:', error);
  }
};

seedExercises();
