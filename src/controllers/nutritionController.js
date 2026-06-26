const db = require('../config/db');

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
      db.run(
        upsert,
        [
          userId,
          date,
          row.calories,
          row.protein,
          row.carbohydrates,
          row.fat,
          row.fiber,
          row.sugar,
          row.saturated_fat,
          row.cholesterol,
          row.sodium,
          row.potassium,
          row.vitamin_a,
          row.vitamin_c,
          row.calcium,
          row.iron,
        ],
        (err2) => {
          if (err2) return reject(err2);
          resolve(row);
        }
      );
    });
  });
};

const toMfpItems = (meals) =>
  meals.map((m) => ({
    type: 'diary_meal',
    id: m.id,
    date: m.date,
    diary_meal: m.meal_name,
    food_name: m.food_name,
    serving_size: m.serving_size,
    serving_unit: m.serving_unit,
    nutritional_contents: {
      energy: { unit: m.energy_unit || 'calories', value: m.energy_value || 0 },
      protein: m.protein,
      carbohydrates: m.carbohydrates,
      fat: m.fat,
      fiber: m.fiber,
      sugar: m.sugar,
      saturated_fat: m.saturated_fat,
      cholesterol: m.cholesterol,
      sodium: m.sodium,
      potassium: m.potassium,
      vitamin_a: m.vitamin_a,
      vitamin_c: m.vitamin_c,
      calcium: m.calcium,
      iron: m.iron,
    },
  }));

// GET /api/nutrition/diary?date=YYYY-MM-DD or ?from=FROM&to=TO
exports.getDiary = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { date, from, to } = req.query;

  let query;
  let params;

  if (from && to) {
    query = `SELECT * FROM nutrition_meals WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date, id`;
    params = [req.session.user.id, from, to];
  } else if (date) {
    query = `SELECT * FROM nutrition_meals WHERE user_id = ? AND date = ? ORDER BY id`;
    params = [req.session.user.id, date];
  } else {
    return res
      .status(400)
      .json({ error: 'Provide date or from/to parameters' });
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ items: toMfpItems(rows) });
  });
};

// GET /api/nutrition/diary/:id
exports.getDiaryEntry = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id } = req.params;
  db.get(
    `SELECT * FROM nutrition_meals WHERE id = ? AND user_id = ?`,
    [id, req.session.user.id],
    (err, row) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Entry not found' });
      res.json({ items: toMfpItems([row]) });
    }
  );
};

// POST /api/nutrition/diary
exports.createMeal = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const {
    date,
    meal_name,
    food_name,
    energy_value,
    energy_unit,
    protein,
    carbohydrates,
    fat,
    fiber,
    sugar,
    saturated_fat,
    cholesterol,
    sodium,
    potassium,
    vitamin_a,
    vitamin_c,
    calcium,
    iron,
    serving_size,
    serving_unit,
  } = req.body;

  if (!date || !meal_name || !food_name) {
    return res
      .status(400)
      .json({ error: 'date, meal_name, and food_name are required' });
  }

  const query = `
    INSERT INTO nutrition_meals (user_id, date, meal_name, food_name, energy_value, energy_unit, protein, carbohydrates, fat, fiber, sugar, saturated_fat, cholesterol, sodium, potassium, vitamin_a, vitamin_c, calcium, iron, serving_size, serving_unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    req.session.user.id,
    date,
    meal_name,
    food_name,
    energy_value || 0,
    energy_unit || 'calories',
    protein || 0,
    carbohydrates || 0,
    fat || 0,
    fiber || 0,
    sugar || 0,
    saturated_fat || 0,
    cholesterol || 0,
    sodium || 0,
    potassium || 0,
    vitamin_a || 0,
    vitamin_c || 0,
    calcium || 0,
    iron || 0,
    serving_size || 0,
    serving_unit || '',
  ];

  db.run(query, params, async function (err) {
    if (err) {
      console.error('[Nutrition] Error saving meal:', err.message);
      return res.status(400).json({ error: err.message });
    }
    try {
      await recalcDiary(req.session.user.id, date);
    } catch (recalcErr) {
      console.error('[Nutrition] Recalc error:', recalcErr.message);
    }
    res.json({
      id: this.lastID,
      message: 'Meal saved successfully',
    });
  });
};

// PATCH /api/nutrition/diary/:id
exports.updateMeal = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id } = req.params;
  const fields = [];
  const values = [];

  const allowed = [
    'meal_name',
    'food_name',
    'energy_value',
    'energy_unit',
    'protein',
    'carbohydrates',
    'fat',
    'fiber',
    'sugar',
    'saturated_fat',
    'cholesterol',
    'sodium',
    'potassium',
    'vitamin_a',
    'vitamin_c',
    'calcium',
    'iron',
    'serving_size',
    'serving_unit',
  ];

  allowed.forEach((f) => {
    if (req.body[f] !== undefined) {
      fields.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  });

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(id, req.session.user.id);
  const query = `UPDATE nutrition_meals SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`;

  db.run(query, values, async function (err) {
    if (err) return res.status(400).json({ error: err.message });
    if (this.changes === 0)
      return res.status(404).json({ error: 'Entry not found' });

    // Get the entry to recalc
    db.get(
      `SELECT date FROM nutrition_meals WHERE id = ?`,
      [id],
      async (err2, row) => {
        if (!err2 && row) {
          try {
            await recalcDiary(req.session.user.id, row.date);
          } catch (e) {}
        }
      }
    );

    res.json({ message: 'Meal updated successfully' });
  });
};

// DELETE /api/nutrition/diary/:id
exports.deleteMeal = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id } = req.params;

  // Get date before deleting for recalc
  db.get(
    `SELECT date FROM nutrition_meals WHERE id = ? AND user_id = ?`,
    [id, req.session.user.id],
    (err, row) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Entry not found' });

      const date = row.date;
      db.run(
        `DELETE FROM nutrition_meals WHERE id = ? AND user_id = ?`,
        [id, req.session.user.id],
        async function (err2) {
          if (err2) return res.status(400).json({ error: err2.message });
          try {
            await recalcDiary(req.session.user.id, date);
          } catch (e) {}
          res.json({ message: 'Meal deleted successfully' });
        }
      );
    }
  );
};

// GET /api/nutrition/summary?from=FROM&to=TO
exports.getSummary = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { from, to } = req.query;
  let query;
  let params;

  if (from && to) {
    query = `SELECT * FROM nutrition_diaries WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date DESC`;
    params = [req.session.user.id, from, to];
  } else {
    query = `SELECT * FROM nutrition_diaries WHERE user_id = ? ORDER BY date DESC`;
    params = [req.session.user.id];
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
};
