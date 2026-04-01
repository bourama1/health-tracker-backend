const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const path = require('path');
const fs = require('fs');

describe('Health Tracker API', () => {
  beforeAll((done) => {
    // Ensure tables exist
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS measurements (
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
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE,
        front_path TEXT,
        side_path TEXT,
        back_path TEXT,
        front_google_id TEXT,
        side_google_id TEXT,
        back_google_id TEXT
      )`);
      db.run(
        `CREATE TABLE IF NOT EXISTS sleep (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE,
        bedtime TEXT,
        wake_time TEXT,
        rhr INTEGER,
        sleep_score INTEGER,
        deep_sleep_minutes INTEGER,
        rem_sleep_minutes INTEGER
      )`,
        (err) => {
          done(err);
        }
      );
    });
  });

  beforeEach((done) => {
    db.serialize(() => {
      db.run('DELETE FROM measurements');
      db.run('DELETE FROM photos');
      db.run('DELETE FROM sleep', (err) => {
        done(err);
      });
    });
  });

  afterAll((done) => {
    db.close((err) => {
      done(err);
    });
  });

  describe('Measurement API', () => {
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

    test('GET /api/measurements should return records in descending order by date', async () => {
      await request(app)
        .post('/api/measurements')
        .send({ date: '2023-10-01', bodyweight: 70 });
      await request(app)
        .post('/api/measurements')
        .send({ date: '2023-10-15', bodyweight: 71 });
      await request(app)
        .post('/api/measurements')
        .send({ date: '2023-10-05', bodyweight: 70.5 });

      const response = await request(app).get('/api/measurements');
      expect(response.status).toBe(200);
      expect(response.body.length).toBe(3);
      expect(response.body[0].date).toBe('2023-10-15');
      expect(response.body[1].date).toBe('2023-10-05');
      expect(response.body[2].date).toBe('2023-10-01');
    });
  });

  describe('Photo API', () => {
    test('POST /api/photos should save Google Photo IDs', async () => {
      const response = await request(app)
        .post('/api/photos')
        .send({
          date: '2023-10-27',
          front_google_id: 'g_front_123',
          side_google_id: 'g_side_123',
          back_google_id: 'g_back_123'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Photos saved successfully');

      const getResponse = await request(app).get('/api/photos/2023-10-27');
      expect(getResponse.body.date).toBe('2023-10-27');
      expect(getResponse.body.front_google_id).toBe('g_front_123');
      expect(getResponse.body.side_google_id).toBe('g_side_123');
      expect(getResponse.body.back_google_id).toBe('g_back_123');
    });

    test('POST /api/photos should update existing record with partial Google IDs', async () => {
      // First save
      await request(app)
        .post('/api/photos')
        .send({
          date: '2023-10-27',
          front_google_id: 'g_front_123'
        });

      const firstResponse = await request(app).get('/api/photos/2023-10-27');
      expect(firstResponse.body.front_google_id).toBe('g_front_123');
      expect(firstResponse.body.side_google_id).toBeNull();

      // Second save with a different photo field
      const response = await request(app)
        .post('/api/photos')
        .send({
          date: '2023-10-27',
          side_google_id: 'g_side_123'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Photos updated successfully');

      const secondResponse = await request(app).get('/api/photos/2023-10-27');
      expect(secondResponse.body.front_google_id).toBe('g_front_123'); // Preserved
      expect(secondResponse.body.side_google_id).toBe('g_side_123'); // Added
    });

    test('GET /api/photos/dates should return all photo dates in descending order', async () => {
      await request(app).post('/api/photos').send({ date: '2023-10-01', front_google_id: 'id1' });
      await request(app).post('/api/photos').send({ date: '2023-10-15', front_google_id: 'id2' });
      await request(app).post('/api/photos').send({ date: '2023-10-05', front_google_id: 'id3' });

      const response = await request(app).get('/api/photos/dates');
      expect(response.status).toBe(200);
      expect(response.body.length).toBe(3);
      expect(response.body[0].date).toBe('2023-10-15');
      expect(response.body[1].date).toBe('2023-10-05');
      expect(response.body[2].date).toBe('2023-10-01');
    });

    test('GET /api/photos/:date should return correct photo record', async () => {
      await request(app).post('/api/photos').send({ date: '2023-10-27', front_google_id: 'id1' });
      const response = await request(app).get('/api/photos/2023-10-27');
      expect(response.status).toBe(200);
      expect(response.body.date).toBe('2023-10-27');
      expect(response.body.front_google_id).toBe('id1');
    });

    test('GET /api/photos/:date should return empty object if no photos for that date', async () => {
      const response = await request(app).get('/api/photos/2020-01-01');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });
  });

  describe('Sleep API', () => {
    test('GET /api/sleep should return an empty array initially', async () => {
      const response = await request(app).get('/api/sleep');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    test('POST /api/sleep should create a new sleep entry', async () => {
      const newSleep = {
        date: '2023-10-27',
        bedtime: '23:00',
        wake_time: '07:00',
        rhr: 55,
        sleep_score: 85,
        deep_sleep_minutes: 90,
        rem_sleep_minutes: 120,
      };

      const response = await request(app).post('/api/sleep').send(newSleep);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Sleep data saved successfully');

      const getResponse = await request(app).get('/api/sleep');
      expect(getResponse.body.length).toBe(1);
      expect(getResponse.body[0].date).toBe('2023-10-27');
      expect(getResponse.body[0].sleep_score).toBe(85);
    });

    test('POST /api/sleep should update existing entry on date conflict', async () => {
      const sleep1 = { date: '2023-10-27', sleep_score: 80 };
      const sleep2 = { date: '2023-10-27', sleep_score: 90 };

      await request(app).post('/api/sleep').send(sleep1);
      const response = await request(app).post('/api/sleep').send(sleep2);

      expect(response.status).toBe(200);

      const getResponse = await request(app).get('/api/sleep');
      expect(getResponse.body.length).toBe(1);
      expect(getResponse.body[0].sleep_score).toBe(90);
    });
  });
});
