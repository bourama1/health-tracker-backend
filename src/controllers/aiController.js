const axios = require('axios');

// ─── Context-specific system prompts ────────────────────────────────────────

const SYSTEM_PROMPTS = {
  sleep: `You are an elite Sleep Scientist and Performance Coach with deep expertise in chronobiology, HRV, and sleep architecture. 
You analyze sleep data to identify patterns that most people miss. You know that:
- HRV below 50ms often signals accumulated fatigue or inadequate recovery
- REM sleep drives memory consolidation and emotional regulation; Deep sleep drives physical repair
- Temperature deviation and recovery index are leading indicators of systemic stress
- Bedtime consistency matters as much as total duration for circadian rhythm health

When analyzing data, look for: HRV trends (not just single values), sleep stage ratios, RHR elevation patterns, bedtime variance, and correlations between metrics.`,

  workout: `You are an elite Strength & Performance Coach specializing in evidence-based training periodization, progressive overload, and fatigue management.
You are well-versed in RPE-based training, 1RM estimation (Brzycki formula), volume landmarks, and muscle recovery timelines.
You know that:
- Training volume (sets × reps × weight) is the primary driver of hypertrophy
- Minimum Effective Volume (MEV) and Maximum Adaptive Volume (MAV) differ per muscle group
- RPE creep on the same weight signals fatigue accumulation
- Consecutive sessions on the same muscle group without 48h recovery stalls progress

When analyzing data, look for: volume trends per muscle group, e1RM progression, frequency per movement pattern, signs of overreaching, and lagging muscle groups.`,

  'workout stats': `You are an elite Strength & Performance Coach specializing in evidence-based training periodization and long-term progressive overload.
Analyze the workout statistics to identify training trends, strengths, weaknesses, and recovery patterns.
Focus on: total volume trends, session frequency, muscle group balance, estimated 1RM progression, and signs of overtraining or undertraining.`,

  measurements: `You are a Body Composition Specialist and Nutrition Coach with expertise in interpreting anthropometric data over time.
You understand that body composition changes are slow and noisy — weekly fluctuations mean less than 4-week trends.
Key metrics you watch: waist-to-hip ratio (cardiovascular risk), body fat percentage trajectory, lean mass preservation during cuts.

When analyzing data, look for: rate of change (too fast cuts lean mass; too slow stalls motivation), measurement consistency, which metrics are improving vs stagnating, and whether the trajectory is aligned with the user's goal.`,

  default: `You are an elite Health & Performance Scientist with expertise in exercise science, sleep physiology, and body composition.
Analyze the provided health data to identify patterns, correlations, and actionable improvements.`,
};

// ─── Context-specific analysis instructions ──────────────────────────────────

const ANALYSIS_INSTRUCTIONS = {
  sleep: `
**Critical — read this before analyzing:**
The data includes \`changes_oldest_to_newest\` with pre-computed, labelled deltas. Use these to determine whether each metric improved or declined — do not re-derive direction from raw entries. Entries in \`entries_oldest_to_newest\` run left-to-right in time; the LAST entry is the most recent night.

**What to analyze:**
- HRV trend — is it improving ↑ or declining ↓? Below 50ms is a concern
- RHR vs HRV relationship — they should move inversely (HRV up + RHR down = good recovery)
- Sleep stage quality: deep + REM as % of total sleep (target >40%)
- Bedtime consistency (variance >30min disrupts circadian rhythm)
- Temperature deviation anomalies (spikes often precede illness or overtraining)
- Recovery index patterns

**Avoid generic advice.** Quote exact values: "Your HRV dropped from Xms to Yms over 14 days — that's a meaningful decline."`,

  workout: `
**What to analyze:**
- Volume per muscle group over time — are lagging muscles getting enough sets?
- e1RM trend on key lifts — are they progressing, stalling, or regressing?
- Training frequency — are any muscle groups trained more than 3x/week without deload?
- RPE trends — is RPE increasing on the same weights (fatigue signal)?
- Session density and gaps — are there unexplained training gaps?
- Movement pattern balance (push/pull ratio, quad/hamstring balance)

**Be specific.** Quote actual lift names and numbers from the data. Don't say "train more consistently" — say "You haven't hit legs in 9 days based on this data; aim for 2x/week minimum for hypertrophy."`,

  measurements: `
**Critical — read this before analyzing:**
The data object includes a \`changes_oldest_to_newest\` field with pre-computed deltas and direction labels. USE THESE — do not re-derive direction from the raw entries, which could mislead you. A positive delta in bodyweight means the user GAINED weight over the period. A negative delta means they LOST weight. The \`bodyweight_rate_context\` field already interprets the weekly rate for you.

**What to analyze:**
- Use \`bodyweight_weekly_rate_kg\` and \`bodyweight_rate_context\` to assess if the rate is appropriate for the user's goal
- Compare bodyweight change vs body_fat_pct change — if both went up, it's a bulk; if weight up but fat% down, it's recomp
- Waist and biceps changes together reveal where the body is changing composition
- Use \`most_recent_values\` for the user's current snapshot
- Flag if measurements frequency is too sparse (gaps make trending unreliable)

**Reference actual numbers and the pre-computed deltas.** If bodyweight change is "+4.5kg (gained)", say exactly that.`,

  default: `Analyze patterns, correlations, and trends. Reference actual data points in your recommendations. Be specific and science-backed.`,
};

// ─── Data preprocessor ───────────────────────────────────────────────────────
// IMPORTANT: All data is sorted ascending by date (oldest first, newest last)
// before any computation. This is the source of truth — never assume the input
// order matches chronological order, since different DB queries use different ORDER BY.

const sortAscByDate = (arr) =>
  [...arr].sort((a, b) => {
    const da = a.date || a.created_at || '';
    const db = b.date || b.created_at || '';
    return da < db ? -1 : da > db ? 1 : 0;
  });

// Average of a key across an array (already sorted or unsorted — order doesn't matter for avg)
const avg = (arr, key) => {
  const vals = arr.filter((d) => d?.[key] != null).map((d) => Number(d[key]));
  return vals.length
    ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
    : null;
};

// Change from earliest to latest value for a key.
// arr MUST be sorted ascending (oldest first) before calling this.
// Returns a human-readable string like "+4.5 (gained)" or "-2.1 (lost)"
const namedDelta = (
  arr,
  key,
  unit = '',
  positiveLabel = 'increased',
  negativeLabel = 'decreased'
) => {
  const withVal = arr.filter((d) => d?.[key] != null);
  if (withVal.length < 2) return null;
  const earliest = Number(withVal[0][key]);
  const latest = Number(withVal[withVal.length - 1][key]);
  const delta = Number((latest - earliest).toFixed(2));
  const sign = delta > 0 ? '+' : '';
  const label =
    delta > 0 ? positiveLabel : delta < 0 ? negativeLabel : 'unchanged';
  return `${sign}${delta}${unit} (${label}) from ${withVal[0].date} to ${withVal[withVal.length - 1].date}`;
};

const preprocessData = (data, contextType) => {
  if (!data) return data;

  // ── Sleep ────────────────────────────────────────────────────────────────────
  if (contextType === 'sleep' && Array.isArray(data)) {
    const sorted = sortAscByDate(data).slice(-14); // oldest→newest, last 14
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];
    const totalMinutes = sorted.map(
      (d) =>
        (d.deep_sleep_minutes || 0) +
        (d.rem_sleep_minutes || 0) +
        (d.light_minutes || 0)
    );

    return {
      _note:
        'Entries are sorted OLDEST→NEWEST. newest entry = most recent night.',
      period_oldest_to_newest: `${oldest?.date} → ${newest?.date}`,
      averages: {
        hrv_ms: avg(sorted, 'hrv'),
        rhr_bpm: avg(sorted, 'rhr'),
        sleep_score: avg(sorted, 'sleep_score'),
        deep_sleep_min: avg(sorted, 'deep_sleep_minutes'),
        rem_sleep_min: avg(sorted, 'rem_sleep_minutes'),
        avg_total_sleep_min: Number(
          (
            totalMinutes.reduce((a, b) => a + b, 0) / (totalMinutes.length || 1)
          ).toFixed(0)
        ),
        restorative_pct: avg(sorted, 'restorative_sleep_percentage'),
      },
      changes_oldest_to_newest: {
        hrv: namedDelta(sorted, 'hrv', 'ms', 'improved ↑', 'declined ↓'),
        rhr: namedDelta(
          sorted,
          'rhr',
          'bpm',
          'elevated ↑ (worse)',
          'lowered ↓ (better)'
        ),
        sleep_score: namedDelta(
          sorted,
          'sleep_score',
          '',
          'improved ↑',
          'declined ↓'
        ),
        deep_sleep: namedDelta(
          sorted,
          'deep_sleep_minutes',
          'min',
          'more ↑',
          'less ↓'
        ),
      },
      entries_oldest_to_newest: sorted.map((d) => ({
        date: d.date,
        hrv: d.hrv,
        rhr: d.rhr,
        sleep_score: d.sleep_score,
        deep_min: d.deep_sleep_minutes,
        rem_min: d.rem_sleep_minutes,
        temp_dev: d.temp_dev,
        recovery_index: d.recovery_index,
        bedtime: d.bedtime,
        wake_time: d.wake_time,
      })),
    };
  }

  // ── Measurements ─────────────────────────────────────────────────────────────
  if (contextType === 'measurements' && Array.isArray(data)) {
    const sorted = sortAscByDate(data).slice(-20); // oldest→newest
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];
    const daySpan =
      oldest && newest
        ? Math.round((new Date(newest.date) - new Date(oldest.date)) / 86400000)
        : null;

    // Compute weekly rate of change for bodyweight
    const bwEntries = sorted.filter((d) => d.bodyweight != null);
    let weeklyBwRate = null;
    if (bwEntries.length >= 2) {
      const days = Math.max(
        1,
        (new Date(bwEntries[bwEntries.length - 1].date) -
          new Date(bwEntries[0].date)) /
          86400000
      );
      const totalChange =
        Number(bwEntries[bwEntries.length - 1].bodyweight) -
        Number(bwEntries[0].bodyweight);
      weeklyBwRate = Number(((totalChange / days) * 7).toFixed(2));
    }

    return {
      _note:
        'Entries sorted OLDEST→NEWEST. Last entry = most recent measurement. Positive delta = value went UP over time.',
      period_oldest_to_newest: `${oldest?.date} → ${newest?.date} (${daySpan} days)`,
      changes_oldest_to_newest: {
        bodyweight: namedDelta(
          sorted,
          'bodyweight',
          'kg',
          'gained ↑',
          'lost ↓'
        ),
        body_fat_pct: namedDelta(
          sorted,
          'body_fat',
          '%',
          'increased ↑',
          'decreased ↓'
        ),
        waist_cm: namedDelta(sorted, 'waist', 'cm', 'grew ↑', 'shrank ↓'),
        biceps_cm: namedDelta(sorted, 'biceps', 'cm', 'grew ↑', 'shrank ↓'),
        vo2_max: namedDelta(sorted, 'vo2_max', '', 'improved ↑', 'declined ↓'),
      },
      bodyweight_weekly_rate_kg: weeklyBwRate,
      bodyweight_rate_context:
        weeklyBwRate !== null
          ? weeklyBwRate > 0.5
            ? `Gaining at ${weeklyBwRate}kg/week — fast bulk or water retention`
            : weeklyBwRate > 0
              ? `Gaining at ${weeklyBwRate}kg/week — lean bulk range`
              : weeklyBwRate < -0.75
                ? `Losing at ${Math.abs(weeklyBwRate)}kg/week — aggressive cut, lean mass risk`
                : weeklyBwRate < 0
                  ? `Losing at ${Math.abs(weeklyBwRate)}kg/week — sustainable cut`
                  : 'Weight stable'
          : null,
      most_recent_values: newest
        ? Object.fromEntries(
            Object.entries(newest).filter(([, v]) => v != null)
          )
        : null,
      entries_oldest_to_newest: sorted.map((d) =>
        Object.fromEntries(Object.entries(d).filter(([, v]) => v != null))
      ),
    };
  }

  // ── Workouts (generic) ───────────────────────────────────────────────────────
  if (Array.isArray(data)) {
    const sorted = sortAscByDate(data).slice(-30);
    return {
      _note: 'Entries sorted OLDEST→NEWEST. Last entry = most recent session.',
      entries_oldest_to_newest: sorted.map((item) =>
        Object.fromEntries(Object.entries(item).filter(([, v]) => v != null))
      ),
    };
  }

  return data;
};

// ─── Build messages for each provider ────────────────────────────────────────

const buildMessages = (systemPrompt, userPrompt, history = []) => {
  // history = [{role: 'user'|'assistant', content: string}, ...]
  const messages = [...history, { role: 'user', content: userPrompt }];
  return { systemPrompt, messages };
};

// ─── Call AI provider ─────────────────────────────────────────────────────────

const callProvider = async (provider, apiKey, systemPrompt, messages) => {
  if (provider === 'groq') {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.6,
        max_tokens: 1200,
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    return response.data.choices[0].message.content;
  } else if (provider === 'gemini') {
    // Gemini uses a different format: system_instruction + contents
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.6, maxOutputTokens: 1200 },
      }
    );
    return response.data.candidates[0].content.parts[0].text;
  } else if (provider === 'openai') {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.6,
        max_tokens: 1200,
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    return response.data.choices[0].message.content;
  } else {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
};

// ─── Controllers ─────────────────────────────────────────────────────────────

exports.analyzeData = async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { provider, apiKey, data, contextType, userGoal } = req.body;

  if (!provider || !apiKey || !data) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const systemPrompt = SYSTEM_PROMPTS[contextType] || SYSTEM_PROMPTS.default;
  const instructions =
    ANALYSIS_INSTRUCTIONS[contextType] || ANALYSIS_INSTRUCTIONS.default;
  const processedData = preprocessData(data, contextType);

  const userPrompt = `
Analyze the following ${contextType || 'health'} data for a user whose primary goal is: "${userGoal || 'General health optimization'}".

### DATA:
${JSON.stringify(processedData, null, 2)}

### INSTRUCTIONS:
${instructions}

### REQUIRED OUTPUT FORMAT (use Markdown):

## 🏆 Wins
What is the user doing well? Reference specific data points.

## ⚠️ Areas for Improvement  
Which specific metrics are off-track? Quote actual values and explain why they matter.

## 🚀 Action Plan
3 numbered, concrete steps the user should take in the next 48-72 hours. Each step should directly address a specific data point above.

Be professional, concise, and highly specific. No generic filler advice.
`.trim();

  try {
    const { systemPrompt: sp, messages } = buildMessages(
      systemPrompt,
      userPrompt
    );
    const responseText = await callProvider(provider, apiKey, sp, messages);
    res.json({ insights: responseText });
  } catch (error) {
    console.error(
      `[AI Analysis] Error with ${provider}:`,
      error.response?.data || error.message
    );
    res.status(500).json({
      error: 'AI analysis failed',
      detail: error.response?.data?.error?.message || error.message,
    });
  }
};

// Follow-up chat — accepts conversation history and continues the analysis session
exports.chat = async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { provider, apiKey, messages, contextType, userGoal } = req.body;

  if (!provider || !apiKey || !messages?.length) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const systemPrompt = `${SYSTEM_PROMPTS[contextType] || SYSTEM_PROMPTS.default}

The user's primary goal is: "${userGoal || 'General health optimization'}".
You are continuing an analysis conversation. Answer follow-up questions precisely. Reference data from earlier in the conversation when relevant. Be concise.`;

  try {
    const responseText = await callProvider(
      provider,
      apiKey,
      systemPrompt,
      messages
    );
    res.json({ reply: responseText });
  } catch (error) {
    console.error(
      `[AI Chat] Error with ${provider}:`,
      error.response?.data || error.message
    );
    res.status(500).json({
      error: 'AI chat failed',
      detail: error.response?.data?.error?.message || error.message,
    });
  }
};
