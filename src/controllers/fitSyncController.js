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
    const recordsMap = {};

    for (const session of sessions) {
      const sessionStartMs = parseInt(session.startTimeMillis);
      const sessionEndMs = parseInt(session.endTimeMillis);

      // Use WAKE date of sleep session as the record date.
      // This ensures that when you wake up on Tuesday morning, the sleep is recorded as Tuesday's sleep,
      // and the "Today" dashboard is not empty.
      const sleepDate = msToDate(sessionEndMs, tz);

      if (!recordsMap[sleepDate]) {
        recordsMap[sleepDate] = {
          date: sleepDate,
          bedtimeMs: sessionStartMs,
          wakeMs: sessionEndMs,
          deepMs: 0,
          remMs: 0,
          lightMs: 0,
          awakeMs: 0,
          sessions: [],
        };
      } else {
        // Merge with existing record for this sleep day (e.g. if sleep was interrupted)
        recordsMap[sleepDate].bedtimeMs = Math.min(
          recordsMap[sleepDate].bedtimeMs,
          sessionStartMs
        );
        recordsMap[sleepDate].wakeMs = Math.max(
          recordsMap[sleepDate].wakeMs,
          sessionEndMs
        );
      }
      recordsMap[sleepDate].sessions.push({
        start: sessionStartMs,
        end: sessionEndMs,
      });
    }

    // Process stages and assign to the correct sleep day record
    for (const pt of stagePoints) {
      const ptStart = parseInt(pt.startTimeNanos) / 1_000_000;
      const ptEnd = parseInt(pt.endTimeNanos) / 1_000_000;
      const stage = pt.value?.[0]?.intVal;

      for (const sleepDate in recordsMap) {
        const record = recordsMap[sleepDate];
        // Point belongs to this sleep day if it falls within any of its sessions
        const isInSession = record.sessions.some(
          (s) => ptStart >= s.start && ptEnd <= s.end
        );

        if (isInSession) {
          if (stage === STAGE_DEEP) record.deepMs += ptEnd - ptStart;
          else if (stage === STAGE_REM) record.remMs += ptEnd - ptStart;
          else if (
            stage === STAGE_SLEEP_LIGHT_1 ||
            stage === STAGE_SLEEP_LIGHT_2
          )
            record.lightMs += ptEnd - ptStart;
          else if (stage === STAGE_AWAKE || stage === STAGE_OUT_OF_BED)
            record.awakeMs += ptEnd - ptStart;
          break; // Point assigned, move to next point
        }
      }
    }

    const records = Object.values(recordsMap).map((r) => {
      // Find nearest RHR point (closest to the LATEST wake time of this sleep day)
      let closestRhrPt = null;
      let minRhrDiff = 24 * 60 * 60 * 1000;

      for (const pt of rhrPoints) {
        const ptMs = parseInt(pt.startTimeNanos) / 1_000_000;
        const diff = Math.abs(ptMs - r.wakeMs);
        if (diff < minRhrDiff) {
          minRhrDiff = diff;
          closestRhrPt = pt;
        }
      }

      const rhr = closestRhrPt
        ? Math.round(
            closestRhrPt.value?.[0]?.fpVal ??
              closestRhrPt.value?.[0]?.intVal ??
              0
          )
        : null;

      return {
        date: r.date,
        bedtime: msToTime(r.bedtimeMs, tz),
        wake_time: msToTime(r.wakeMs, tz),
        rhr,
        deep_sleep_minutes: Math.round(r.deepMs / 60000) || null,
        rem_sleep_minutes: Math.round(r.remMs / 60000) || null,
        light_minutes: Math.round(r.lightMs / 60000) || null,
        awake_minutes: Math.round(r.awakeMs / 60000) || null,
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
    if (
      err.message.includes('invalid authentication credentials') ||
      err.message.includes('invalid_grant') ||
      err.status === 401
    ) {
      return res
        .status(401)
        .json({ error: 'Google session expired. Please log in again.' });
    }
    return res.status(500).json({ error: 'Sync failed', detail: err.message });
  }
};
