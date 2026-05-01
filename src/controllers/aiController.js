const axios = require('axios');

exports.analyzeData = async (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { provider, apiKey, data, contextType } = req.body;

  if (!provider || !apiKey || !data) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const prompt = `
    You are a professional health and fitness coach. 
    Analyze the following ${contextType || 'health'} data and provide actionable insights.
    
    Data:
    ${JSON.stringify(data, null, 2)}
    
    Instructions:
    1. Identify trends or specific values that need improvement.
    2. Provide concrete, evidence-based advice on how to improve those values.
    3. Be concise and professional.
    4. Focus on the most impactful changes first.
    5. If data is limited, provide general advice based on the available data.
  `;

  try {
    let responseText = '';

    if (provider === 'groq') {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
        },
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      responseText = response.data.choices[0].message.content;
    } else if (provider === 'gemini') {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
        }
      );
      responseText = response.data.candidates[0].content.parts[0].text;
    } else if (provider === 'openai') {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
        },
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      responseText = response.data.choices[0].message.content;
    } else {
      return res.status(400).json({ error: 'Unsupported AI provider' });
    }

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
