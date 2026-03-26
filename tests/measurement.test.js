const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

describe('Measurement API', () => {
  beforeAll((done) => {
    // Ensure the table exists (it should be handled by db.js, but just in case)
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        bodyweight REAL,
        body_fat REAL,
        chest REAL,
        waist REAL,
        biceps REAL
      )`, (err) => {
        done(err);
      });
    });
  });

  beforeEach((done) => {
    db.run('DELETE FROM measurements', (err) => {
      done(err);
    });
  });

  afterAll((done) => {
    // We don't necessarily want to close the shared DB connection here if it's used elsewhere,
    // but for tests it's generally fine.
    db.close((err) => {
      done(err);
    });
  });

  test('GET /api/measurements should return an empty array initially', async () => {
    const response = await request(app).get('/api/measurements');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(0);
  });

  test('POST /api/measurements should create a new measurement', async () => {
    const newMeasurement = {
      date: '2023-10-27',
      bodyweight: 80.5,
      body_fat: 15.2,
      chest: 100,
      waist: 85,
      biceps: 35
    };

    const response = await request(app)
      .post('/api/measurements')
      .send(newMeasurement);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id');
    expect(response.body.message).toBe('Measurement saved successfully');

    const getResponse = await request(app).get('/api/measurements');
    expect(getResponse.body.length).toBe(1);
    expect(getResponse.body[0].bodyweight).toBe(80.5);
  });
});
