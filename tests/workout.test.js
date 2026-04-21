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

    test('getLastSessionForDay and getLastPerformance should return notes', async () => {
      // First create a plan to get a day_id
      const newPlan = {
        name: 'Notes Test Plan',
        days: [{ name: 'Day 1', exercises: [{ exercise_id: 'test_squat' }] }],
      };
      await request(app).post('/api/workouts/plans').send(newPlan);
      const plans = await request(app).get('/api/workouts/plans');
      const dayId = plans.body[0].days[0].id;

      const newSession = {
        day_id: dayId,
        date: '2023-10-27',
        notes: 'Feeling strong today',
        logs: [
          {
            exercise_id: 'test_squat',
            set_number: 1,
            weight: 80,
            reps: 5,
            notes: 'Easy set',
          },
        ],
      };

      await request(app).post('/api/workouts/sessions').send(newSession);

      // Verify getLastSessionForDay
      const lastSessionResponse = await request(app).get(
        `/api/workouts/sessions/last-for-day/${dayId}`
      );
      expect(lastSessionResponse.status).toBe(200);
      expect(lastSessionResponse.body.notes).toBe('Feeling strong today');
      expect(lastSessionResponse.body.logs[0].notes).toBe('Easy set');

      // Verify getLastPerformance
      const lastPerfResponse = await request(app).get(
        `/api/workouts/sessions/last-performance?exercise_ids=test_squat`
      );
      expect(lastPerfResponse.status).toBe(200);
      expect(lastPerfResponse.body.test_squat[0].notes).toBe('Easy set');
    });
  });

  describe('Analytics', () => {
    test('GET /api/workouts/progress/:exercise_id should return progress data', async () => {
      const newPlan = {
        name: 'Progress Test Plan',
        days: [
          { name: 'Day 1', exercises: [{ exercise_id: 'test_bench_press' }] },
        ],
      };
      await request(app).post('/api/workouts/plans').send(newPlan);
      const plans = await request(app).get('/api/workouts/plans');
      const dayId = plans.body[0].days[0].id;

      await request(app)
        .post('/api/workouts/sessions')
        .send({
          day_id: dayId,
          date: '2023-10-01',
          logs: [
            {
              exercise_id: 'test_bench_press',
              set_number: 1,
              weight: 60,
              reps: 10,
            },
          ],
        });

      await request(app)
        .post('/api/workouts/sessions')
        .send({
          day_id: dayId,
          date: '2023-10-15',
          logs: [
            {
              exercise_id: 'test_bench_press',
              set_number: 1,
              weight: 65,
              reps: 8,
            },
          ],
        });

      const response = await request(app).get(
        '/api/workouts/progress/test_bench_press'
      );
      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2);
      expect(response.body[0].max_weight).toBe(60);
      expect(response.body[1].max_weight).toBe(65);
    });

    test('GET /api/workouts/stats should return summary statistics', async () => {
      const response = await request(app).get('/api/workouts/stats');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalSessions');
      expect(response.body).toHaveProperty('totalSets');
      expect(response.body).toHaveProperty('totalPRs');
    });
  });
});
