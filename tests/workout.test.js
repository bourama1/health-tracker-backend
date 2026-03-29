const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

describe('Workout API', () => {
  beforeAll((done) => {
    // Seeding a few exercises for testing
    db.serialize(() => {
      db.run(
        "INSERT OR IGNORE INTO exercises (id, name, category, equipment, primary_muscles) VALUES ('test_bench_press', 'Test Bench Press', 'strength', 'barbell', 'chest')"
      );
      db.run(
        "INSERT OR IGNORE INTO exercises (id, name, category, equipment, primary_muscles) VALUES ('test_squat', 'Test Squat', 'strength', 'barbell', 'quads')",
        done
      );
    });
  });

  beforeEach((done) => {
    db.serialize(() => {
      db.run('DELETE FROM workout_plans');
      db.run('DELETE FROM workout_sessions', done);
    });
  });

  describe('Exercises', () => {
    test('GET /api/workouts/exercises should return exercises', async () => {
      const response = await request(app).get('/api/workouts/exercises');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body.some((e) => e.id === 'test_bench_press')).toBe(true);
    });
  });

  describe('Plans', () => {
    test('POST /api/workouts/plans should create a plan with days and exercises', async () => {
      const newPlan = {
        name: 'Test Plan',
        description: 'A test workout plan',
        days: [
          {
            name: 'Push Day',
            exercises: [
              {
                exercise_id: 'test_bench_press',
                sets: 3,
                reps: 10,
                weight: 60,
              },
            ],
          },
        ],
      };

      const response = await request(app)
        .post('/api/workouts/plans')
        .send(newPlan);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Workout plan created successfully');

      const getResponse = await request(app).get('/api/workouts/plans');
      expect(getResponse.body.length).toBe(1);
      expect(getResponse.body[0].name).toBe('Test Plan');
      expect(getResponse.body[0].days.length).toBe(1);
      expect(getResponse.body[0].days[0].name).toBe('Push Day');
      expect(getResponse.body[0].days[0].exercises[0].exercise_id).toBe(
        'test_bench_press'
      );
    });
  });

  describe('Sessions', () => {
    test('POST /api/workouts/sessions should save a session with logs', async () => {
      // First create a plan to get a day_id
      const newPlan = {
        name: 'Session Test Plan',
        days: [{ name: 'Day 1', exercises: [{ exercise_id: 'test_squat' }] }],
      };
      await request(app).post('/api/workouts/plans').send(newPlan);
      const plans = await request(app).get('/api/workouts/plans');
      const dayId = plans.body[0].days[0].id;

      const newSession = {
        day_id: dayId,
        date: '2023-10-27',
        logs: [
          { exercise_id: 'test_squat', set_number: 1, weight: 80, reps: 5 },
          { exercise_id: 'test_squat', set_number: 2, weight: 80, reps: 5 },
        ],
      };

      const response = await request(app)
        .post('/api/workouts/sessions')
        .send(newSession);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Workout session saved successfully');

      const historyResponse = await request(app).get('/api/workouts/sessions');
      expect(historyResponse.body.length).toBe(1);
      expect(historyResponse.body[0].day_name).toBe('Day 1');
      expect(historyResponse.body[0].logs.length).toBe(2);
      expect(historyResponse.body[0].logs[0].exercise_id).toBe('test_squat');
      expect(historyResponse.body[0].logs[0].weight).toBe(80);
    });
  });
});
