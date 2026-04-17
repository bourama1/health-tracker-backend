const db = require('../config/db');
const axios = require('axios');

/**
 * Ultrahuman API Sync Controller
 *
 * Documentation: https://partner.ultrahuman.com/api/v1/partner/daily_metrics
 */

const ULTRAHUMAN_API_URL =
  'https://partner.ultrahuman.com/api/v1/partner/daily_metrics';

exports.syncUltrahumanData = async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userId = req.session.user.id;
  const userEmail = req.session.user.email;
  const days = Math.min(parseInt(req.query.days || '7', 10), 90);
  const token = process.env.ULTRAHUMAN_TOKEN;

  if (!token) {
    return res
      .status(500)
      .json({ error: 'Ultrahuman API token not configured on server' });
  }

  console.log(
    `[UltrahumanSync] Starting sync for user ${userId} (${userEmail}), days: ${days}`
  );

  try {
    let syncedDays = 0;
    const today = new Date();

    // Ultrahuman API works best with one day at a time or 7-day range.
    // We'll fetch day by day for simplicity and to handle potential missing data gracefully.
    for (let i = 0; i < days; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - i);
      const dateStr = targetDate.toISOString().split('T')[0];

      try {
        const response = await axios.get(ULTRAHUMAN_API_URL, {
          headers: { 'Authorization': token },
          params: {
            date: dateStr
          }
        });

        const apiResponse = response.data;
        const timezone = apiResponse.data?.latest_time_zone || 'UTC';
        const dayMetrics = apiResponse.data?.metrics?.[dateStr];

        if (!dayMetrics || !Array.isArray(dayMetrics)) {
          console.log(`[UltrahumanSync] No metrics array found for ${dateStr}`);
          continue;
        }

        // Helper to format epoch seconds to HH:mm
        const formatTime = (epoch, tz) => {
          if (!epoch) return null;
          try {
            return new Intl.DateTimeFormat('en-GB', {
              timeZone: tz,
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            }).format(new Date(epoch * 1000));
          } catch (e) {
            return new Date(epoch * 1000).toISOString().slice(11, 16);
          }
        };

        // Extract metrics from the array
        const sleepObj = dayMetrics.find(m => m.type === 'sleep')?.object || {};
        const rhrObj = dayMetrics.find(m => m.type === 'sleep_rhr')?.object || {};
        const hrvObj = dayMetrics.find(m => m.type === 'avg_sleep_hrv')?.object || 
                       dayMetrics.find(m => m.type === 'hrv')?.object || {};
        const weightObj = dayMetrics.find(m => m.type === 'weight')?.object || {};
        const recoveryObj = dayMetrics.find(m => m.type === 'recovery_index')?.object || {};
        const vo2maxObj = dayMetrics.find(m => m.type === 'vo2_max')?.object || {};

        const sleepRecord = {
          user_id: userId,
          date: dateStr,
          bedtime: formatTime(sleepObj.bedtime_start, timezone),
          wake_time: formatTime(sleepObj.bedtime_end, timezone),
          rhr: rhrObj.value || null,
          hrv: hrvObj.value || null,
          sleep_score: sleepObj.sleep_score?.score || null,
          recovery_index: recoveryObj.value || null,
          temp_dev: sleepObj.temperature_deviation?.celsius || null,
          deep_sleep_minutes: sleepObj.deep_sleep?.minutes || null,
          rem_sleep_minutes: sleepObj.rem_sleep?.minutes || null,
          light_minutes: sleepObj.light_sleep?.minutes || null,
          awake_minutes: sleepObj.time_in_bed?.minutes ? (sleepObj.time_in_bed.minutes - (sleepObj.total_sleep?.minutes || 0)) : null
        };

        // Upsert Sleep
        const sleepSql = `
          INSERT INTO sleep
            (user_id, date, bedtime, wake_time, rhr, hrv, sleep_score, recovery_index, temp_dev,
             deep_sleep_minutes, rem_sleep_minutes, light_minutes, awake_minutes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, date) DO UPDATE SET
            rhr                 = COALESCE(excluded.rhr,                 sleep.rhr),
            hrv                 = COALESCE(excluded.hrv,                 sleep.hrv),
            sleep_score         = COALESCE(excluded.sleep_score,         sleep.sleep_score),
            recovery_index      = COALESCE(excluded.recovery_index,      sleep.recovery_index),
            temp_dev            = COALESCE(excluded.temp_dev,            sleep.temp_dev),
            deep_sleep_minutes  = COALESCE(excluded.deep_sleep_minutes,  sleep.deep_sleep_minutes),
            rem_sleep_minutes   = COALESCE(excluded.rem_sleep_minutes,   sleep.rem_sleep_minutes),
            light_minutes       = COALESCE(excluded.light_minutes,       sleep.light_minutes),
            awake_minutes       = COALESCE(excluded.awake_minutes,       sleep.awake_minutes)
        `;

        await db.run(sleepSql, [
          sleepRecord.user_id,
          sleepRecord.date,
          sleepRecord.bedtime,
          sleepRecord.wake_time,
          sleepRecord.rhr,
          sleepRecord.hrv,
          sleepRecord.sleep_score,
          sleepRecord.recovery_index,
          sleepRecord.temp_dev,
          sleepRecord.deep_sleep_minutes,
          sleepRecord.rem_sleep_minutes,
          sleepRecord.light_minutes,
          sleepRecord.awake_minutes
        ]);

        // If weight or VO2 Max are present
        if (weightObj.value || vo2maxObj.value) {
            const weightSql = `
                INSERT INTO measurements (user_id, date, bodyweight, vo2_max)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, date) DO UPDATE SET
                    bodyweight = COALESCE(excluded.bodyweight, measurements.bodyweight),
                    vo2_max    = COALESCE(excluded.vo2_max,    measurements.vo2_max)
            `;
            await db.run(weightSql, [userId, dateStr, weightObj.value || null, vo2maxObj.value || null]);
        }

        syncedDays++;
      } catch (dayErr) {
        console.error(
          `[UltrahumanSync] Error syncing ${dateStr}:`,
          dayErr.message
        );
        // Continue to next day
      }
    }

    return res.json({
      synced: syncedDays,
      message: `Successfully synced ${syncedDays} days from Ultrahuman.`,
    });
  } catch (err) {
    console.error('[UltrahumanSync] Global Error:', err.message);
    return res.status(500).json({ error: 'Sync failed', detail: err.message });
  }
};
