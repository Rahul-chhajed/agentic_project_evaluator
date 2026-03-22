const { GoogleGenerativeAI } = require('@google/generative-ai');
const { truncateText } = require('../utils/textUtils');

let modelInstance = null;

const getGeminiModel = () => {
  if (modelInstance) return modelInstance;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing. Add it in backend/.env to enable LLM evaluation.');
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const client = new GoogleGenerativeAI(apiKey);
  modelInstance = client.getGenerativeModel({ model: modelName });
  return modelInstance;
};

const extractJson = (text) => {
  if (!text) {
    throw new Error('Gemini returned empty output.');
  }

  const cleaned = String(text).trim();

  // Fast path when response is already raw JSON.
  try {
    return JSON.parse(cleaned);
  } catch (_e) {
    // Continue with extraction heuristics.
  }

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : cleaned;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Gemini response did not contain valid JSON object.');
  }

  return JSON.parse(candidate.slice(start, end + 1));
};

const parseWithRepair = (text) => {
  try {
    return extractJson(text);
  } catch (_err) {
    const repaired = String(text || '')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    return extractJson(repaired);
  }
};

const generate = async (model, prompt, { jsonMode, temperature, maxOutputTokens }) => {
  const generationConfig = {
    temperature,
    topP: 0.8,
    maxOutputTokens,
  };

  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  });

  return result.response.text();
};

const askGeminiForJson = async (
  prompt,
  {
    maxAttempts = 2,
    maxOutputTokens = 1200,
    temperature = 0.2,
    fallbackFactory,
  } = {}
) => {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // getGeminiModel is inside the try so model-init failures are caught
      // and routed to fallbackFactory instead of propagating as unhandled errors.
      const model = getGeminiModel();

      // Strategy 1: Gemini native JSON mode.
      let rawText = null;
      try {
        rawText = await generate(model, `${prompt}\n\nReturn strict JSON only.`, {
          jsonMode: true,
          temperature,
          maxOutputTokens,
        });
        return parseWithRepair(rawText);
      } catch (_e1) {
        // Strategy 1 failed — fall through to plain-text mode.
      }

      // Strategy 2: Plain text mode (more compatible on some model versions).
      try {
        rawText = await generate(model, `${prompt}\n\nOutput one JSON object only.`, {
          jsonMode: false,
          temperature,
          maxOutputTokens,
        });
        return parseWithRepair(rawText);
      } catch (_e2) {
        // Strategy 2 failed — fall through to repair mode.
      }

      // Strategy 3: Ask the model to self-repair the last bad output.
      if (rawText) {
        try {
          const repairText = await generate(
            model,
            [
              'Rewrite the content below into a single valid JSON object only.',
              'Do not include markdown, comments, or extra text.',
              'If a field is missing, infer a reasonable value.',
              '',
              truncateText(rawText, 9000),
            ].join('\n'),
            {
              jsonMode: false,
              temperature: 0,
              maxOutputTokens,
            }
          );
          return parseWithRepair(repairText);
        } catch (_e3) {
          // Strategy 3 also failed — outer catch will record the error.
          throw _e3;
        }
      }

      throw new Error('All parse strategies exhausted with no valid JSON output.');
    } catch (err) {
      lastError = err;
    }
  }

  if (fallbackFactory) {
    return fallbackFactory(lastError);
  }

  throw lastError;
};

module.exports = {
  askGeminiForJson,
};
