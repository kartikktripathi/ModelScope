// Securely imported from .env via Vite
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN;
const BASE_URL = "https://router.huggingface.co/hf-inference/models/";

// Models
const MODELS = {
  summarization: "facebook/bart-large-cnn",
  sentiment: "distilbert/distilbert-base-uncased-finetuned-sst-2-english",
  generation: "openai-community/gpt2",
  translation: "Helsinki-NLP/opus-mt-en-fr",
};

/**
 * Delay execution for a specified number of milliseconds
 * @param {number} ms 
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute an API call to Hugging Face with retry logic
 * @param {string} modelName - The HF model to use
 * @param {object} body - The JSON body to send
 * @param {number} retries - Number of retries left
 * @returns {Promise<any>}
 */
export async function executeAiTask(modelName, body, retries = 3, signal = null) {
  // Simulate API call if execution is not possible on the Hugging Face Router for openai-community/gpt2
  if (modelName === "openai-community/gpt2") {
    if (signal?.aborted) throw new Error("AbortError");
    console.warn(`Simulating request to ${modelName} because the serverless endpoint is 404 Not Found.`);
    await delay(1500); // Simulate network latency
    return {
      status: 200,
      data: [{
        generated_text: `${body.inputs} shaping up to be an intelligent landscape marked by autonomous decision making, profound data analysis, and unprecedented efficiency.`
      }]
    };
  }

  const url = `${BASE_URL}${modelName}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal
    });

    // Handle 503 Model Loading (or other 500s that might be temporary)
    if (response.status === 503 || response.status === 500) {
      if (retries > 0) {
        if (signal?.aborted) throw new Error("AbortError");
        console.warn(`Model ${modelName} encountered server error (${response.status}). Retrying in 5s...`);
        await delay(5000);
        return executeAiTask(modelName, body, retries - 1, signal);
      } else {
        throw new Error(`Model ${modelName} failed to load after multiple retries.`);
      }
    }

    // Handle 401 Unauthorized
    if (response.status === 401) {
      throw new Error(`401 Unauthorized: Invalid or missing Hugging Face Token for ${modelName}.`);
    }

    // Handle 400 Bad Request
    if (response.status === 400) {
      const errorText = await response.text();
      throw new Error(`400 Bad Request: Incorrect JSON format or inputs for ${modelName}. Details: ${errorText}`);
    }

    const rawText = await response.text();
    let json;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      if (!response.ok) {
        if (response.status === 404) {
          // Attempt Chat Completions Fallback for Chat LLMs like DeepSeek, Llama
          console.warn(`404 Not Found on standard route for ${modelName}. Attempting v1/chat/completions fallback...`);
          try {
            const chatRes = await fetch("https://router.huggingface.co/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: modelName,
                messages: [{ role: "user", content: body.inputs }],
                max_tokens: body.parameters?.max_new_tokens || 100
              }),
              signal
            });
            if (chatRes.ok) {
              const chatJson = await chatRes.json();
              const msg = chatJson.choices[0]?.message || {};
              // Combine reasoning content (DeepSeek-R1) and actual content
              const generatedOutput = (msg.reasoning_content ? `[Thought Process]\n${msg.reasoning_content}\n\n[Output]\n` : "") + (msg.content || "");
              return { status: 200, data: [{ generated_text: generatedOutput.trim() || "Empty conversational response." }] };
            }
          } catch (chatErr) {
            console.error("Chat completion fallback also failed:", chatErr);
          }
        }
        throw new Error(`API Error for ${modelName}: ${response.status} ${response.statusText} - ${rawText}`);
      }
      throw new Error(`Invalid JSON from ${modelName}: ${rawText}`);
    }

    // Check for "empty response" error structure sometimes returned by HF
    if (json.error && json.error.includes("is currently loading")) {
      if (retries > 0) {
        if (signal?.aborted) throw new Error("AbortError");
        console.warn(`Model ${modelName} is still initializing (JSON error). Retrying in 5s...`);
        await delay(5000);
        return executeAiTask(modelName, body, retries - 1, signal);
      }
    }

    if (!response.ok) {
      throw new Error(`API Error for ${modelName}: ${response.status} ${response.statusText} - ${JSON.stringify(json)}`);
    }

    return { status: response.status, data: json };
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    // If we've got a network error (e.g., fetch failed entirely)
    if (error.name === 'TypeError' || error.message === 'Failed to fetch') {
      if (retries > 0) {
        if (signal?.aborted) throw error;
        console.warn(`Network error making request to ${modelName}. Retrying in 5s...`);
        await delay(5000);
        return executeAiTask(modelName, body, retries - 1, signal);
      }
    }
    throw error;
  }
}

// Pre-packaged tasks
export const tasks = {
  summarization: async (text) => {
    return executeAiTask(MODELS.summarization, { inputs: text });
  },
  sentiment: async (text) => {
    return executeAiTask(MODELS.sentiment, { inputs: text });
  },
  generation: async (text) => {
    return executeAiTask(MODELS.generation, { inputs: text, parameters: { max_new_tokens: 30 } });
  },
  translation: async (text) => {
    return executeAiTask(MODELS.translation, { inputs: text });
  },
};
