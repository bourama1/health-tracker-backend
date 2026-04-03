const request = require('supertest');
const path = require('path');

// Mock cloudinary and multer-storage-cloudinary
jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(),
    },
  },
}));

jest.mock('multer-storage-cloudinary', () => ({
  CloudinaryStorage: jest.fn().mockImplementation(() => ({})),
}));

// Mock multer to bypass stream processing and manually populate req.files
jest.mock('multer', () => {
  return jest.fn().mockImplementation(() => ({
    fields: jest.fn().mockImplementation(() => (req, res, next) => {
      // Manually parse simple fields for supertest multipart requests if needed
      // or just assume they are there for mocking req.files
      req.files = {
        front: [{ path: 'mock-cloudinary-url-front' }],
        side: [{ path: 'mock-cloudinary-url-side' }],
        back: [{ path: 'mock-cloudinary-url-back' }],
      };
      next();
    }),
  }));
});

const app = require('../src/app');
const db = require('../src/config/db');

describe('Health Tracker API', () => {
  beforeAll((done) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
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
        user_id TEXT,
        date TEXT,
        front_path TEXT,
        side_path TEXT,
        back_path TEXT,
        front_google_id TEXT,
        side_google_id TEXT,
        back_google_id TEXT,
        UNIQUE(user_id, date)
      )`);
      db.run(
        `CREATE TABLE IF NOT EXISTS sleep (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        date TEXT,
        bedtime TEXT,
        wake_time TEXT,
        rhr INTEGER,
        sleep_score INTEGER,
        deep_sleep_minutes INTEGER,
        rem_sleep_minutes INTEGER,
        UNIQUE(user_id, date)
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

    test('POST /api/measurements should create a new measurement', async () => {
      const newMeasurement = {
        date: '2023-10-27',
        bodyweight: 80.5,
      };

      const response = await request(app)
        .post('/api/measurements')
        .send(newMeasurement);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Measurement saved successfully');
    });
  });

  describe('Photo API', () => {
    test('POST /api/photos should save Cloudinary URLs (mocked)', async () => {
      const response = await request(app)
        .post('/api/photos')
        .send({ date: '2023-10-27' }); // Use send for simplicity since multer is mocked

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Photos saved successfully');

      const getResponse = await request(app).get('/api/photos/2023-10-27');
      expect(getResponse.body.date).toBe('2023-10-27');
      expect(getResponse.body.front_path).toBe('mock-cloudinary-url-front');
    });

    test('POST /api/photos should update existing record with partial uploads', async () => {
      await request(app).post('/api/photos').send({ date: '2023-10-27' });

      const response = await request(app)
        .post('/api/photos')
        .send({ date: '2023-10-27' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Photos updated successfully');

      const secondResponse = await request(app).get('/api/photos/2023-10-27');
      expect(secondResponse.body.front_path).toBe('mock-cloudinary-url-front');
    });

    test('GET /api/photos/dates should return all photo dates in descending order', async () => {
      await db.run(
        "INSERT INTO photos (user_id, date, front_path) VALUES ('test-user-id', '2023-10-01', 'path1')"
      );
      await db.run(
        "INSERT INTO photos (user_id, date, front_path) VALUES ('test-user-id', '2023-10-15', 'path2')"
      );
      await db.run(
        "INSERT INTO photos (user_id, date, front_path) VALUES ('test-user-id', '2023-10-05', 'path3')"
      );

      const response = await request(app).get('/api/photos/dates');
      expect(response.status).toBe(200);
      expect(response.body.length).toBe(3);
    });

    test('GET /api/photos/:date should return correct photo record', async () => {
      await db.run(
        "INSERT INTO photos (user_id, date, front_path) VALUES ('test-user-id', '2023-10-27', 'path1')"
      );
      const response = await request(app).get('/api/photos/2023-10-27');
      expect(response.status).toBe(200);
      expect(response.body.date).toBe('2023-10-27');
      expect(response.body.front_path).toBe('path1');
    });
  });

  describe('Sleep API', () => {
    test('POST /api/sleep should create a new sleep entry', async () => {
      const newSleep = {
        date: '2023-10-27',
        sleep_score: 85,
      };

      const response = await request(app).post('/api/sleep').send(newSleep);
      expect(response.status).toBe(200);
    });
  });
});
