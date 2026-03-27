const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

describe('Measurement API', () => {
  beforeAll((done) => {
    // Ensure the table exists with all columns
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        bodyweight REAL,
        body_fat REAL,
        chest REAL,
        waist REAL,
        biceps REAL,
        forearm REAL,
        calf REAL,
        thigh REAL
      )`,
        (err) => {
          done(err);
        }
      );
    });
  });

  beforeEach((done) => {
    db.run('DELETE FROM measurements', (err) => {
      done(err);
    });
  });

  afterAll((done) => {
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

  test('POST /api/measurements should create a new measurement with new fields', async () => {
    const newMeasurement = {
      date: '2023-10-27',
      bodyweight: 80.5,
      body_fat: 15.2,
      chest: 100,
      waist: 85,
      biceps: 35,
      forearm: 28,
      calf: 38,
      thigh: 60,
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
    expect(getResponse.body[0].forearm).toBe(28);
    expect(getResponse.body[0].calf).toBe(38);
    expect(getResponse.body[0].thigh).toBe(60);
  });

  test('POST /api/measurements should fail if date is missing', async () => {
    const response = await request(app)
      .post('/api/measurements')
      .send({ bodyweight: 80 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Date is required');
  });

  test('POST /api/measurements should fail if no measurement is provided', async () => {
    const response = await request(app)
      .post('/api/measurements')
      .send({ date: '2023-10-27' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('At least one measurement is required');
  });

  test('POST /api/measurements should succeed with only one measurement', async () => {
    const response = await request(app)
      .post('/api/measurements')
      .send({ date: '2023-10-27', thigh: 55 });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Measurement saved successfully');
  });
});
