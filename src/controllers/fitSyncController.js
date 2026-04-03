const { google } = require('googleapis');
const db = require('../config/db');

// ─── helpers ────────────────────────────────────────────────────────────────

/** ms timestamp → "HH:MM" local-time string (server TZ doesn't matter –
 *  we just store the clock face the user saw) */
const msToTime = (ms) => {
  const d = new Date(ms);
  return d.toTimeString().slice(0, 5); // "HH:MM"
};

/** ms timestamp → "YYYY-MM-DD" for the *wake* date (the date the session ended) */
const msToDate = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Google Fit sleep stages:
 *   1 = awake (during sleep)   2 = sleep (light)
 *   3 = out-of-bed             4 = light sleep
 *   5 = deep sleep             6 = REM
 */
const DEEP_STAGE = 5;
const REM_STAGE = 6;

// ─── main sync ──────────────────────────────────────────────────────────────

exports.syncGoogleFitSleep = async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const tokens = req.session.tokens;
  if (!tokens) {
    return res.status(401).json({ error: 'No Google tokens in session. Please log in again.' });
  }

  // How far back to sync – default 30 days, caller can pass ?days=N (max 90)
  const days = Math.min(parseInt(req.query.days || '30', 10), 90);
  const endMs   = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;

  // Build an OAuth2 client using the stored session tokens
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
  );
  oauth2Client.setCredentials(tokens);

  // Persist refreshed tokens back into the session automatically
  oauth2Client.on('tokens', (newTokens) => {
    req.session.tokens = { ...tokens, ...newTokens };
  });

  const fitness = google.fitness({ version: 'v1', auth: oauth2Client });

  try {
    // ── 1. Fetch sleep SESSIONS (gives us bedtime + wake time) ──────────────
    const sessionsResp = await fitness.users.sessions.list({
      userId: 'me',
      startTime: new Date(startMs).toISOString(),
      endTime:   new Date(endMs).toISOString(),
      activityType: 72, // 72 = sleep
    });

    const sessions = (sessionsResp.data.session || []).filter(
      (s) => parseInt(s.activityType) === 72
    );

    if (sessions.length === 0) {
      return res.json({ synced: 0, message: 'No sleep sessions found in Google Fit for this period.' });
    }

    // ── 2. Fetch sleep STAGE data (deep / REM minutes) ──────────────────────
    const datasetId = `${startMs * 1_000_000}-${endMs * 1_000_000}`; // nanoseconds
    let stagePoints = [];

    try {
      const stagesResp = await fitness.users.dataSources.datasets.get({
        userId: 'me',
        dataSourceId:
          'derived:com.google.sleep.segment:com.google.android.gms:merged',
        datasetId,
      });
      stagePoints = stagesResp.data.point || [];
    } catch {
      // Sleep stage data is optional – not all devices/apps write it
      console.warn('[FitSync] Sleep stage data unavailable, will sync without deep/REM.');
    }

    // ── 3. Fetch resting heart rate data ────────────────────────────────────
    let rhrPoints = [];
    try {
      const rhrResp = await fitness.users.dataSources.datasets.get({
        userId: 'me',
        dataSourceId:
          'derived:com.google.heart_rate.bpm:com.google.android.gms:resting_heart_rate<-merge_heart_rate_bpm',
        datasetId,
      });
      rhrPoints = rhrResp.data.point || [];
    } catch {
      // RHR data is optional
      console.warn('[FitSync] RHR data unavailable, will sync without RHR.');
    }

    // ── 4. Map each session → sleep record ──────────────────────────────────
    const records = sessions.map((session) => {
      const sessionStartMs = parseInt(session.startTimeMillis);
      const sessionEndMs   = parseInt(session.endTimeMillis);

      const wakeDate = msToDate(sessionEndMs); // date we call this sleep entry
      const bedtime  = msToTime(sessionStartMs);
      const wakeTime = msToTime(sessionEndMs);

      // Sum deep & REM minutes for data points that fall within this session
      let deepMs = 0;
      let remMs  = 0;

      for (const pt of stagePoints) {
        const ptStart = parseInt(pt.startTimeNanos) / 1_000_000;
        const ptEnd   = parseInt(pt.endTimeNanos)   / 1_000_000;
        const stage   = pt.value?.[0]?.intVal;

        if (ptStart >= sessionStartMs && ptEnd <= sessionEndMs) {
          if (stage === DEEP_STAGE) deepMs += ptEnd - ptStart;
          if (stage === REM_STAGE)  remMs  += ptEnd - ptStart;
        }
      }

      const deepMinutes = deepMs > 0 ? Math.round(deepMs / 60_000) : null;
      const remMinutes  = remMs  > 0 ? Math.round(remMs  / 60_000) : null;

      // Nearest RHR reading on the same calendar date
      let rhr = null;
      for (const pt of rhrPoints) {
        const ptDate = msToDate(parseInt(pt.startTimeNanos) / 1_000_000);
        if (ptDate === wakeDate) {
          rhr = Math.round(pt.value?.[0]?.fpVal ?? 0) || null;
          break;
        }
      }

      return { date: wakeDate, bedtime, wake_time: wakeTime, rhr, deepMinutes, remMinutes };
    });

    // ── 5. Upsert into DB ────────────────────────────────────────────────────
    const upsertSql = `
      INSERT INTO sleep
        (user_id, date, bedtime, wake_time, rhr, deep_sleep_minutes, rem_sleep_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        bedtime             = COALESCE(excluded.bedtime,             sleep.bedtime),
        wake_time           = COALESCE(excluded.wake_time,           sleep.wake_time),
        rhr                 = COALESCE(excluded.rhr,                 sleep.rhr),
        deep_sleep_minutes  = COALESCE(excluded.deep_sleep_minutes,  sleep.deep_sleep_minutes),
        rem_sleep_minutes   = COALESCE(excluded.rem_sleep_minutes,   sleep.rem_sleep_minutes)
    `;

    let synced = 0;
    for (const r of records) {
      await db.run(upsertSql, [
        req.session.user.id,
        r.date,
        r.bedtime,
        r.wake_time,
        r.rhr,
        r.deepMinutes,
        r.remMinutes,
      ]);
      synced++;
    }

    return res.json({
      synced,
      message: `Successfully synced ${synced} sleep session${synced !== 1 ? 's' : ''} from Google Fit.`,
    });

  } catch (err) {
    console.error('[FitSync] Error syncing Google Fit sleep:', err.message);

    // Token expired / revoked → tell frontend to re-authenticate
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
      return res.status(401).json({ error: 'Google token expired. Please log in again.' });
    }

    return res.status(500).json({ error: 'Failed to sync from Google Fit.', detail: err.message });
  }
};
