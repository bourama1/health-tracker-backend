/**
 * Calculates a sleep score from 0 to 100 based on user preferences.
 * Ideal sleep: 22:00 to 06:00 (8 hours).
 * Higher deep/REM sleep is better.
 * Lower RHR is better.
 * Higher HRV is better.
 * Efficiency (time asleep / time in bed) is key.
 *
 * @param {Object} data
 * @param {string} data.bedtime - "HH:MM"
 * @param {string} data.wakeTime - "HH:MM"
 * @param {number} data.rhr - Resting Heart Rate (optional)
 * @param {number} data.hrv - HRV rmssd (optional)
 * @param {number} data.deepMins - Minutes of deep sleep (optional)
 * @param {number} data.remMins - Minutes of REM sleep (optional)
 * @param {number} data.lightMins - Minutes of light sleep (optional)
 * @param {number} data.awakeMins - Minutes of awake time during session (optional)
 * @returns {number} Score from 0 to 100
 */
const calculateSleepScore = ({
  bedtime,
  wakeTime,
  rhr = null,
  hrv = null,
  deepMins = null,
  remMins = null,
  lightMins = null,
  awakeMins = null,
}) => {
  if (!bedtime || !wakeTime) return null;

  const getMins = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const bedtimeMins = getMins(bedtime);
  const wakeMins = getMins(wakeTime);

  let durationMins = wakeMins - bedtimeMins;
  if (durationMins <= 0) durationMins += 24 * 60;

  let efficiency = 1.0;
  if (awakeMins !== null && awakeMins < durationMins) {
    efficiency = (durationMins - awakeMins) / durationMins;
  }

  // -- NEW STRICT SCORING BREAKDOWN (Total 100) --
  let score = 0;

  // 1. Duration (Max 20 pts)
  // Target 8 hours (480 mins).
  // -2 pts for every 15 mins deviation from 480.
  const idealDuration = 480;
  const durationDiff = Math.abs(durationMins - idealDuration);
  score += Math.max(0, 20 - (durationDiff / 15) * 2);

  // 2. Efficiency (Max 20 pts)
  // 20 pts if >= 95%. -2 pts for every 1% below 95%.
  const efficiencyPct = efficiency * 100;
  if (efficiencyPct >= 95) {
    score += 20;
  } else {
    score += Math.max(0, 20 - (95 - efficiencyPct) * 2);
  }

  // 3. Timing (Max 10 pts)
  // Bedtime 22:00, Wake 06:00. -1 pt per 10m deviation for each.
  const idealBedtime = 22 * 60;
  let bedtimeDiff = Math.abs(bedtimeMins - idealBedtime);
  if (bedtimeDiff > 12 * 60) bedtimeDiff = 24 * 60 - bedtimeDiff;
  score += Math.max(0, 5 - bedtimeDiff / 10);

  const idealWakeTime = 6 * 60;
  let wakeDiff = Math.abs(wakeMins - idealWakeTime);
  if (wakeDiff > 12 * 60) wakeDiff = 24 * 60 - wakeDiff;
  score += Math.max(0, 5 - wakeDiff / 10);

  // 4. Deep Sleep (Max 20 pts)
  // Target >= 100 mins. -2 pts per 5 mins below 100.
  if (deepMins !== null) {
    if (deepMins >= 100) {
      score += 20;
    } else {
      score += Math.max(0, 20 - ((100 - deepMins) / 5) * 2);
    }
  } else {
    score += 10; // Neutral if missing
  }

  // 5. REM Sleep (Max 10 pts)
  // Target >= 90 mins. -1 pt per 5 mins below 90.
  if (remMins !== null) {
    if (remMins >= 90) {
      score += 10;
    } else {
      score += Math.max(0, 10 - ((90 - remMins) / 5) * 1);
    }
  } else {
    score += 5;
  }

  // 6. RHR (Max 10 pts)
  // Target <= 52 bpm. -2 pts for every bpm above 52.
  if (rhr !== null) {
    if (rhr <= 52) {
      score += 10;
    } else {
      score += Math.max(0, 10 - (rhr - 52) * 2);
    }
  } else {
    score += 5;
  }

  // 7. HRV (Max 10 pts)
  // Target >= 70 rmssd. -1 pt for every 2 units below 70.
  if (hrv !== null) {
    if (hrv >= 70) {
      score += 10;
    } else {
      score += Math.max(0, 10 - (70 - hrv) / 2);
    }
  } else {
    score += 5;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
};

module.exports = { calculateSleepScore };
