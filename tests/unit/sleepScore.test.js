const { calculateSleepScore } = require('../../src/utils/sleepScore');

describe('Sleep Score Calculation', () => {
  test('Perfect sleep should score 100', () => {
    const data = {
      bedtime: '22:00',
      wakeTime: '06:00',
      rhr: 50,
      hrv: 75,
      deepMins: 120,
      remMins: 100,
      awakeMins: 10,
    };
    const score = calculateSleepScore(data);
    expect(score).toBe(100);
  });

  test('Poor sleep should score low', () => {
    const data = {
      bedtime: '01:00',
      wakeTime: '05:00',
      rhr: 70,
      hrv: 30,
      deepMins: 30,
      remMins: 20,
      awakeMins: 60,
    };
    const score = calculateSleepScore(data);
    expect(score).toBeLessThan(40);
  });

  test('Should handle missing data by providing neutral scores', () => {
    const data = {
      bedtime: '22:00',
      wakeTime: '06:00',
      // rhr, hrv, deepMins, remMins, awakeMins missing
    };
    const score = calculateSleepScore(data);
    // 20 (duration) + 20 (efficiency) + 10 (timing) + 10 (deep neutral) + 5 (rem neutral) + 5 (rhr neutral) + 5 (hrv neutral) = 75
    expect(score).toBe(75);
  });

  test('Should return null if bedtime or wakeTime is missing', () => {
    expect(calculateSleepScore({ bedtime: '22:00' })).toBeNull();
    expect(calculateSleepScore({ wakeTime: '06:00' })).toBeNull();
    expect(calculateSleepScore({})).toBeNull();
  });

  test('Should handle negative duration by wrapping around 24h', () => {
    const data = {
      bedtime: '23:00',
      wakeTime: '07:00',
    };
    const score = calculateSleepScore(data);
    expect(score).toBeGreaterThan(0);
  });

  test('High RHR should decrease score', () => {
    const goodSleep = {
      bedtime: '22:00',
      wakeTime: '06:00',
      rhr: 50,
    };
    const badRhrSleep = {
      bedtime: '22:00',
      wakeTime: '06:00',
      rhr: 80,
    };
    expect(calculateSleepScore(badRhrSleep)).toBeLessThan(calculateSleepScore(goodSleep));
  });
});
