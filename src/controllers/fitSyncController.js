const { google } = require('googleapis');
const db = require('../config/db');

// ─── helpers ────────────────────────────────────────────────────────────────

const msToTime = (ms, tz = 'UTC') => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ms));
    const hour = parts.find((p) => p.type === 'hour').value;
    const minute = parts.find((p) => p.type === 'minute').value;
    return `${hour}:${minute}`;
  } catch (err) {
    console.error(`[FitSync] Time formatting error for tz ${tz}:`, err.message);
    // Fallback to UTC
    const d = new Date(ms);
    return d.toISOString().slice(11, 16);
  }
};

const msToDate = (ms, tz = 'UTC') => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(ms));
    const year = parts.find((p) => p.type === 'year').value;
    const month = parts.find((p) => p.type === 'month').value;
    const day = parts.find((p) => p.type === 'day').value;
    return `${year}-${month}-${day}`;
  } catch (err) {
    console.error(`[FitSync] Date formatting error for tz ${tz}:`, err.message);
    return new Date(ms).toISOString().slice(0, 10);
  }
};

// Google Fit sleep stages
const STAGE_AWAKE = 1;
const STAGE_SLEEP_LIGHT_1 = 2;
const STAGE_OUT_OF_BED = 3;
const STAGE_SLEEP_LIGHT_2 = 4;
const STAGE_DEEP = 5;
const STAGE_REM = 6;

// ─── main sync ──────────────────────────────────────────────────────────────

exports.syncGoogleFitSleep = async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const tokens = req.session.tokens;
  if (!tokens) {
    return res
      .status(401)
      .json({ error: 'No Google tokens in session. Please log in again.' });
  }

  const days = Math.min(parseInt(req.query.days || '30', 10), 90);
  const tz = req.query.tz || 'UTC';
  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;

  console.log(
    `[FitSync] Starting sync for user ${req.session.user.id}, days: ${days}, tz: ${tz}`
  );

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:5000/api/auth/google/callback'
  );
  oauth2Client.setCredentials(tokens);

  oauth2Client.on('tokens', (newTokens) => {
    req.session.tokens = { ...tokens, ...newTokens };
  });

  const fitness = google.fitness({ version: 'v1', auth: oauth2Client });

  try {
    // ── 1. Fetch sleep SESSIONS ─────────────────────────────────────────────
    const sessionsResp = await fitness.users.sessions.list({
      userId: 'me',
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      activityType: 72, // sleep
    });

    const sessions = (sessionsResp.data.session || []).filter(
      (s) => parseInt(s.activityType) === 72
    );

    if (sessions.length === 0) {
      return res.json({
        synced: 0,
        message: 'No sleep sessions found in Google Fit.',
      });
    }

    // ── 2. Fetch Detailed Data Streams ──────────────────────────────────────
    const datasetId = `${startMs * 1_000_000}-${endMs * 1_000_000}`;

    // Helper to fetch dataset
    const fetchDataset = async (dataSourceId) => {
      try {
        const resp = await fitness.users.dataSources.datasets.get({
          userId: 'me',
          dataSourceId,
          datasetId,
        });
        return resp.data.point || [];
      } catch (err) {
        console.warn(`[FitSync] Data stream ${dataSourceId} unavailable.`);
        return [];
      }
    };

    const [stagePoints, rhrPoints] = await Promise.all([
      fetchDataset(
        'derived:com.google.sleep.segment:com.google.android.gms:merged'
      ),
      fetchDataset(
        'derived:com.google.heart_rate.bpm:com.google.android.gms:resting_heart_rate<-merge_heart_rate_bpm'
      ),
    ]);

    // ── 3. Map Sessions to Records ──────────────────────────────────────────
    const records = sessions.map((session) => {
      const sessionStartMs = parseInt(session.startTimeMillis);
      const sessionEndMs = parseInt(session.endTimeMillis);
      const wakeDate = msToDate(sessionEndMs, tz);

      let deepMs = 0;
      let remMs = 0;
      let lightMs = 0;
      let awakeMs = 0;

      for (const pt of stagePoints) {
        const ptStart = parseInt(pt.startTimeNanos) / 1_000_000;
        const ptEnd = parseInt(pt.endTimeNanos) / 1_000_000;
        const stage = pt.value?.[0]?.intVal;

        if (ptStart >= sessionStartMs && ptEnd <= sessionEndMs) {
          if (stage === STAGE_DEEP) deepMs += ptEnd - ptStart;
          else if (stage === STAGE_REM) remMs += ptEnd - ptStart;
          else if (
            stage === STAGE_SLEEP_LIGHT_1 ||
            stage === STAGE_SLEEP_LIGHT_2
          )
            lightMs += ptEnd - ptStart;
          else if (stage === STAGE_AWAKE || stage === STAGE_OUT_OF_BED)
            awakeMs += ptEnd - ptStart;
        }
      }

      // Find nearest RHR
      const rhrPt = rhrPoints.find((pt) => {
        const ptMs = parseInt(pt.startTimeNanos) / 1_000_000;
        return msToDate(ptMs, tz) === wakeDate;
      });
      const rhr = rhrPt
        ? Math.round(rhrPt.value?.[0]?.fpVal ?? rhrPt.value?.[0]?.intVal ?? 0)
        : null;

      const bedtime = msToTime(sessionStartMs, tz);
      const wakeTime = msToTime(sessionEndMs, tz);

      const deepMinutes = Math.round(deepMs / 60000) || null;
      const remMinutes = Math.round(remMs / 60000) || null;
      const lightMinutes = Math.round(lightMs / 60000) || null;
      const awakeMinutes = Math.round(awakeMs / 60000) || null;

      return {
        date: wakeDate,
        bedtime,
        wake_time: wakeTime,
        rhr,
        deep_sleep_minutes: deepMinutes,
        rem_sleep_minutes: remMinutes,
        light_minutes: lightMinutes,
        awake_minutes: awakeMinutes,
      };
    });

    // ── 4. Upsert into DB ───────────────────────────────────────────────────
    const upsertSql = `
      INSERT INTO sleep
        (user_id, date, bedtime, wake_time, rhr, 
         deep_sleep_minutes, rem_sleep_minutes, light_minutes, awake_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        bedtime             = COALESCE(excluded.bedtime,             sleep.bedtime),
        wake_time           = COALESCE(excluded.wake_time,           sleep.wake_time),
        rhr                 = COALESCE(excluded.rhr,                 sleep.rhr),
        deep_sleep_minutes  = COALESCE(excluded.deep_sleep_minutes,  sleep.deep_sleep_minutes),
        rem_sleep_minutes   = COALESCE(excluded.rem_sleep_minutes,   sleep.rem_sleep_minutes),
        light_minutes       = COALESCE(excluded.light_minutes,       sleep.light_minutes),
        awake_minutes       = COALESCE(excluded.awake_minutes,       sleep.awake_minutes)
    `;

    let synced = 0;
    for (const r of records) {
      await db.run(upsertSql, [
        req.session.user.id,
        r.date,
        r.bedtime,
        r.wake_time,
        r.rhr,
        r.deep_sleep_minutes,
        r.rem_sleep_minutes,
        r.light_minutes,
        r.awake_minutes,
      ]);
      synced++;
    }

    return res.json({
      synced,
      message: `Successfully synced ${synced} sessions.`,
    });
  } catch (err) {
    console.error('[FitSync] Error:', err.message);
    return res.status(500).json({ error: 'Sync failed', detail: err.message });
  }
};
