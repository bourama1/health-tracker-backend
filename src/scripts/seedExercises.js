const https = require('https');
const db = require('../config/db');

const EXERCISES_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

const fetchExercises = () =>
  new Promise((resolve, reject) => {
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
      .on('error', reject);
  });
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    })
  );

const seedExercises = async (exitOnComplete = false) => {
  try {
    console.log('Fetching exercises from GitHub...');
    const exercises = await fetchExercises();
    console.log(`Fetched ${exercises.length} exercises. Seeding...`);

    // Ensure all columns exist (safe to run on existing DBs)
    await dbRun(
      `ALTER TABLE exercises ADD COLUMN secondary_muscles TEXT`,
      []
    ).catch(() => {});
    await dbRun(`ALTER TABLE exercises ADD COLUMN force TEXT`, []).catch(
      () => {}
    );
    await dbRun(`ALTER TABLE exercises ADD COLUMN level TEXT`, []).catch(
      () => {}
    );
    await dbRun(`ALTER TABLE exercises ADD COLUMN mechanic TEXT`, []).catch(
      () => {}
    );
    await dbRun(`ALTER TABLE exercises ADD COLUMN instructions TEXT`, []).catch(
      () => {}
    );

    await dbRun('BEGIN TRANSACTION');
    const stmt = db.prepare(`
      INSERT INTO exercises
        (id, name, category, equipment, primary_muscles, secondary_muscles, force, level, mechanic, instructions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        equipment = excluded.equipment,
        primary_muscles = excluded.primary_muscles,
        secondary_muscles = excluded.secondary_muscles,
        force = excluded.force,
        level = excluded.level,
        mechanic = excluded.mechanic,
        instructions = excluded.instructions
    `);

    const runStmt = (params) =>
      new Promise((resolve, reject) => {
        stmt.run(...params, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

    for (const ex of exercises) {
      await runStmt([
        ex.id,
        ex.name,
        ex.category,
        ex.equipment,
        (ex.primaryMuscles || []).join(', '),
        (ex.secondaryMuscles || []).join(', '),
        ex.force || null,
        ex.level || null,
        ex.mechanic || null,
        ex.instructions ? JSON.stringify(ex.instructions) : null,
      ]);
    }

    stmt.finalize();
    await dbRun('COMMIT');
    console.log('Successfully seeded exercises with full data!');
    if (exitOnComplete) process.exit(0);
  } catch (error) {
    console.error('Error seeding exercises:', error);
    if (exitOnComplete) process.exit(1);
    throw error;
  }
};

if (require.main === module) {
  seedExercises(true);
}

module.exports = seedExercises;
