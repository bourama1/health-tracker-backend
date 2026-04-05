const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

// Mock googleapis
jest.mock('googleapis', () => {
  const mFitness = {
    users: {
      sessions: {
        list: jest.fn().mockResolvedValue({
          data: {
            session: [
              {
                startTimeMillis: '1698357600000', // 2023-10-26 22:00 UTC
                endTimeMillis: '1698386400000',   // 2023-10-27 06:00 UTC
                activityType: 72,
              },
            ],
          },
        }),
      },
      dataSources: {
        datasets: {
          get: jest.fn().mockImplementation(({ dataSourceId }) => {
            if (dataSourceId.includes('sleep.segment')) {
              return Promise.resolve({
                data: {
                  point: [
                    {
                      startTimeNanos: '1698357600000000000',
                      endTimeNanos: '1698361200000000000',
                      value: [{ intVal: 5 }], // Deep sleep (1 hour)
                    },
                    {
                      startTimeNanos: '1698361200000000000',
                      endTimeNanos: '1698364800000000000',
                      value: [{ intVal: 6 }], // REM sleep (1 hour)
                    },
                  ],
                },
              });
            } else if (dataSourceId.includes('resting_heart_rate')) {
              return Promise.resolve({
                data: {
                  point: [
                    {
                      startTimeNanos: '1698386400000000000', // Match session end time (wake date)
                      value: [{ fpVal: 52.0 }],
                    },
                  ],
                },
              });
            }
            return Promise.resolve({ data: { point: [] } });
          }),
        },
      },
    },
  };

  const mAuth = {
    OAuth2: jest.fn().mockImplementation(() => ({
      setCredentials: jest.fn(),
      generateAuthUrl: jest.fn(),
      getToken: jest.fn(),
      on: jest.fn(),
    })),
  };

  return {
    google: {
      fitness: jest.fn(() => mFitness),
      auth: mAuth,
    },
  };
});

describe('Google Fit Sync API', () => {
  beforeEach((done) => {
    db.run('DELETE FROM sleep', (err) => {
      done(err);
    });
  });

  test('POST /api/fit/sync-sleep should sync sleep data from Google Fit', async () => {
    const response = await request(app)
      .post('/api/fit/sync-sleep')
      .query({ days: 1, tz: 'UTC' });

    expect(response.status).toBe(200);
    expect(response.body.synced).toBe(1);

    const sleepData = await new Promise((resolve) => {
      db.all('SELECT * FROM sleep WHERE user_id = ?', ['test-user-id'], (err, rows) => {
        resolve(rows);
      });
    });

    expect(sleepData.length).toBe(1);
    expect(sleepData[0].date).toBe('2023-10-27');
    expect(sleepData[0].bedtime).toBe('22:00');
    expect(sleepData[0].wake_time).toBe('06:00');
    expect(sleepData[0].rhr).toBe(52);
    expect(sleepData[0].deep_sleep_minutes).toBe(60);
    expect(sleepData[0].rem_sleep_minutes).toBe(60);
  });
});
