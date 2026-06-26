const https = require('https');
const db = require('../config/db');

const MFP_API_BASE = 'api.myfitnesspal.com';

const mfpGet = (path) =>
  new Promise((resolve, reject) => {
    const url = `https://${MFP_API_BASE}${path}`;
    console.log(`[MFP] GET ${url}`);
    const opts = {
      hostname: MFP_API_BASE,
      path,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
    https
      .get(opts, (res) => {
        console.log(`[MFP] Response status: ${res.statusCode} ${res.statusMessage}`);
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          console.log(`[MFP] Raw response length: ${data.length} chars`);
          console.log(`[MFP] Raw response preview: ${data.substring(0, 500)}`);
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`MFP parse error: ${e.message}. Raw: ${data.substring(0, 200)}`));
          }
        });
      })
      .on('error', (e) => {
        console.error(`[MFP] Request error: ${e.message}`);
        reject(e);
      });
  });

const recalcDiary = (userId, date) => {
  const query = `
    SELECT
      COALESCE(SUM(energy_value), 0) as calories,
      COALESCE(SUM(protein), 0) as protein,
      COALESCE(SUM(carbohydrates), 0) as carbohydrates,
      COALESCE(SUM(fat), 0) as fat,
      COALESCE(SUM(fiber), 0) as fiber,
      COALESCE(SUM(sugar), 0) as sugar,
      COALESCE(SUM(saturated_fat), 0) as saturated_fat,
      COALESCE(SUM(cholesterol), 0) as cholesterol,
      COALESCE(SUM(sodium), 0) as sodium,
      COALESCE(SUM(potassium), 0) as potassium,
      COALESCE(SUM(vitamin_a), 0) as vitamin_a,
      COALESCE(SUM(vitamin_c), 0) as vitamin_c,
      COALESCE(SUM(calcium), 0) as calcium,
      COALESCE(SUM(iron), 0) as iron
    FROM nutrition_meals WHERE user_id = ? AND date = ?
  `;
  return new Promise((resolve, reject) => {
    db.get(query, [userId, date], (err, row) => {
      if (err) return reject(err);
      const upsert = `
        INSERT INTO nutrition_diaries (user_id, date, calories, protein, carbohydrates, fat, fiber, sugar, saturated_fat, cholesterol, sodium, potassium, vitamin_a, vitamin_c, calcium, iron)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
          calories = excluded.calories,
          protein = excluded.protein,
          carbohydrates = excluded.carbohydrates,
          fat = excluded.fat,
          fiber = excluded.fiber,
          sugar = excluded.sugar,
          saturated_fat = excluded.saturated_fat,
          cholesterol = excluded.cholesterol,
          sodium = excluded.sodium,
          potassium = excluded.potassium,
          vitamin_a = excluded.vitamin_a,
          vitamin_c = excluded.vitamin_c,
          calcium = excluded.calcium,
          iron = excluded.iron
      `;
      db.run(upsert, [
        userId, date,
        row.calories, row.protein, row.carbohydrates, row.fat,
        row.fiber, row.sugar, row.saturated_fat, row.cholesterol,
        row.sodium, row.potassium, row.vitamin_a, row.vitamin_c,
        row.calcium, row.iron,
      ], (err2) => {
        if (err2) return reject(err2);
        resolve(row);
      });
    });
  });
};

// POST /api/nutrition/mfp/import
exports.importDiary = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { username, from, to } = req.body;
  if (!username || !from || !to) {
    return res.status(400).json({ error: 'username, from, and to are required' });
  }

  const userId = req.session.user.id;

  try {
    console.log(`[MFP] Fetching range ${from} to ${to} for user ${username}...`);
    const data = await mfpGet(
      `/api/services/diary/read_diary?username=${encodeURIComponent(username)}&from=${from}&to=${to}&types=food_entry`
    );

    console.log(`[MFP] Response type: ${typeof data}, isArray: ${Array.isArray(data)}, length: ${Array.isArray(data) ? data.length : 'N/A'}`);
    if (!Array.isArray(data)) {
      console.log(`[MFP] Response is not an array, got: ${typeof data}`);
      if (data && typeof data === 'object') {
        console.log(`[MFP] Response keys: ${Object.keys(data).join(', ')}`);
      }
      return res.json({
        message: 'No food entries found in date range',
        total_imported: 0,
        total_skipped: 0,
        dates: [],
      });
    }

    if (data.length === 0) {
      console.log(`[MFP] Empty array returned, no entries found`);
      return res.json({
        message: 'No food entries found in date range',
        total_imported: 0,
        total_skipped: 0,
        dates: [],
      });
    }

    // Group entries by date for per-date recalc
    const byDate = {};
    for (const entry of data) {
      const mfpId = entry.id;
      if (!mfpId) {
        console.log(`[MFP] Entry has no id, keys: ${Object.keys(entry).join(', ')}`);
        continue;
      }

      const date = entry.date;
      if (!date) {
        console.log(`[MFP] Entry has no date, skipping`);
        continue;
      }

      console.log(`[MFP] Processing entry id=${mfpId}, date=${date}, meal=${entry.meal_name}, food=${entry.food?.description}`);

      if (!byDate[date]) byDate[date] = { entries: 0, skipped: 0 };

      const existing = await new Promise((resolve) =>
        db.get(
          `SELECT id FROM nutrition_meals WHERE mfp_entry_id = ? AND user_id = ?`,
          [mfpId, userId],
          (err, row) => resolve(row)
        )
      );

      if (existing) {
        console.log(`[MFP] Duplicate entry id=${mfpId}, skipping`);
        byDate[date].skipped++;
        continue;
      }

      const nc = entry.nutritional_contents || {};
      const food = entry.food || {};
      const serving = entry.serving_size || {};

      console.log(`[MFP] Inserting: meal=${entry.meal_name}, food=${food.description || food.brand_name}, kcal=${nc.energy?.value}, servings=${entry.servings}`);

      const query = `
        INSERT INTO nutrition_meals (
          user_id, date, meal_name, food_name, mfp_entry_id,
          energy_value, energy_unit,
          protein, carbohydrates, fat, fiber, sugar,
          saturated_fat, cholesterol, sodium, potassium,
          vitamin_a, vitamin_c, calcium, iron,
          serving_size, serving_unit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        userId,
        date,
        entry.meal_name || '',
        food.description || food.brand_name || 'Unknown',
        mfpId,
        nc.energy?.value || 0,
        nc.energy?.unit || 'calories',
        nc.protein || 0,
        nc.carbohydrates || 0,
        nc.fat || 0,
        nc.fiber || 0,
        nc.sugar || 0,
        nc.saturated_fat || 0,
        nc.cholesterol || 0,
        nc.sodium || 0,
        nc.potassium || 0,
        nc.vitamin_a || 0,
        nc.vitamin_c || 0,
        nc.calcium || 0,
        nc.iron || 0,
        entry.servings || 1,
        serving.unit || '',
      ];

      await new Promise((resolve, reject) =>
        db.run(query, params, (err) => {
          if (err) {
            console.error(`[MFP] DB insert error: ${err.message}`);
            reject(err);
          } else resolve();
        })
      );

      byDate[date].entries++;
    }

    // Recalc each date that had changes
    const importedDates = [];
    let totalEntries = 0;
    let totalSkipped = 0;
    for (const [date, counts] of Object.entries(byDate)) {
      if (counts.entries > 0 || counts.skipped > 0) {
        console.log(`[MFP] ${date}: ${counts.entries} imported, ${counts.skipped} skipped, recalculating...`);
        try { await recalcDiary(userId, date); } catch (e) { console.error(`[MFP] Recalc error for ${date}: ${e.message}`); }
      }
      if (counts.entries > 0) {
        importedDates.push({ date, imported: counts.entries, skipped: counts.skipped });
      }
      totalEntries += counts.entries;
      totalSkipped += counts.skipped;
    }

    // Save username for future auto-sync
    db.run(`UPDATE users SET mfp_username = ? WHERE id = ?`, [username, userId]);

    res.json({
      message: `Imported ${totalEntries} food entries from MFP (${totalSkipped} skipped as duplicates)`,
      total_imported: totalEntries,
      total_skipped: totalSkipped,
      dates: importedDates,
    });
  } catch (err) {
    console.error('[MFP Import] Error:', err.message);
    res.status(500).json({ error: `MFP import failed: ${err.message}` });
  }
};
