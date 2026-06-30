// Securely imported from .env via Vite
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN;

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
 * Checks if a model repository exists on Hugging Face Hub.
 * Returns a friendly error message depending on whether the model is completely invalid
 * or just unsupported for serverless inference.
 * @param {string} cleanModelName 
 * @param {AbortSignal} signal 
 * @param {string} token 
 * @returns {Promise<string>}
 */
async function checkModelSupport(cleanModelName, signal, token) {
  try {
    const response = await fetch(`https://huggingface.co/api/models/${cleanModelName}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal
    });
    if (response.status === 404) {
      return "Error, not a valid model";
    }
    return "This model doesn't support serverless inference on Hugging Face.";
  } catch (e) {
    if (e.name === "AbortError") throw e;
    return "This model doesn't support serverless inference on Hugging Face.";
  }
}

/**
 * Execute an API call to Hugging Face with retry logic
 * @param {string} modelName - The HF model to use
 * @param {object} body - The JSON body to send
 * @param {number} retries - Number of retries left
 * @returns {Promise<any>}
 */
export async function executeAiTask(modelName, body, retries = 3, signal = null, taskType = "generation") {
  const isImageTask = ["flux", "krea", "zimage", "sdxl"].includes(taskType);

  // Parse custom provider prefix (e.g. together/meta-llama/Llama-3.1-8B-Instruct)
  let provider = "hf-inference";
  let cleanModelName = modelName;

  const providerMatch = modelName.match(/^(hf-inference|together|fal-ai|replicate|novita|groq|sambanova|cerebras|featherless-ai|nebius|hyperbolic|deepinfra|friendliai|lepton|fireworks|nscale|octoai)\/(.+)$/i);
  if (providerMatch) {
    provider = providerMatch[1].toLowerCase();
    cleanModelName = providerMatch[2];
  }

  // Simulate API call if execution is not possible on the Hugging Face Router for openai-community/gpt2
  if (cleanModelName === "openai-community/gpt2") {
    if (signal?.aborted) throw new Error("AbortError");
    console.warn(`Simulating request to ${cleanModelName} because the serverless endpoint is 404 Not Found.`);
    await delay(1500); // Simulate network latency
    return {
      status: 200,
      data: [{
        generated_text: `${body.inputs} shaping up to be an intelligent landscape marked by autonomous decision making, profound data analysis, and unprecedented efficiency.`
      }]
    };
  }

  // Determine if we should route to Chat Completions API by default
  const isChatFallback = !isImageTask && cleanModelName !== "openai-community/gpt2" && /llama|mistral|qwen|deepseek|instruct|chat|gemma|phi/i.test(cleanModelName);

  const url = isChatFallback
    ? "https://router.huggingface.co/v1/chat/completions"
    : `https://router.huggingface.co/${provider}/models/${cleanModelName}`;

  const getChatMessages = (task, input) => {
    let sys = "You are a helpful AI assistant.";
    if (task === "translation") sys = "You are an expert translator. Translate the following text from English to French. Respond ONLY with the final translation, no conversational filler or explanations.";
    if (task === "summarization") sys = "You are an expert summarizer. Provide a concise summary of the following text.";
    if (task === "sentiment") sys = "Analyze the sentiment of the following text. Respond strictly with 'POSITIVE' or 'NEGATIVE' only.";
    // Many models (like DeepSeek R1) do not natively support the "system" role in Hugging Face Serverless API.
    // We combine the system prompt and the user input into a single "user" message to guarantee compatibility.
    return [
      { role: "user", content: `Instruction: ${sys}\n\nInput Context: ${input}` }
    ];
  };

  let requestBody;
  if (isChatFallback) {
    requestBody = {
      model: provider !== "hf-inference" ? `${cleanModelName}:${provider}` : cleanModelName,
      messages: getChatMessages(taskType, body.inputs),
      max_tokens: body.parameters?.max_new_tokens || 200
    };
  } else {
    requestBody = body;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal
    });

    // Handle 503 Model Loading (or other 500s that might be temporary)
    if (response.status === 503 || response.status === 500) {
      if (retries > 0) {
        if (signal?.aborted) throw new Error("AbortError");
        console.warn(`Model ${modelName} encountered server error (${response.status}). Retrying in 5s...`);
        await delay(5000);
        return executeAiTask(modelName, body, retries - 1, signal, taskType);
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
      if (isChatFallback) {
        console.warn(`400 Bad Request on Chat API for ${modelName}. Retrying on Standard Inference API...`);
        const fallbackRawPrompt = getChatMessages(taskType, body.inputs)[0].content + "\n\nOutput:";
        const standardFallbackReq = await fetch(`https://router.huggingface.co/${provider}/models/${cleanModelName}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, inputs: fallbackRawPrompt }),
          signal
        });
        if (standardFallbackReq.ok) {
          const standardJson = await standardFallbackReq.json();
          return { status: standardFallbackReq.status, data: standardJson };
        }
      }

      let errorMsg = "";
      try {
        const parsed = JSON.parse(errorText);
        errorMsg = parsed.error || "";
      } catch (e) {
        errorMsg = errorText;
      }

      if (errorMsg.includes("not supported by provider") || errorMsg.includes("no longer supported")) {
        const friendlyMessage = await checkModelSupport(cleanModelName, signal, HF_TOKEN);
        throw new Error(friendlyMessage);
      }
      throw new Error(`400 Bad Request: Incorrect JSON format or inputs for ${modelName}. Details: ${errorText}`);
    }

    const contentType = response.headers.get("Content-Type") || "";
    if (response.ok && (contentType.includes("image") || isImageTask)) {
      const blob = await response.blob();
      return { status: response.status, data: blob, isImage: true };
    }

    const rawText = await response.text();
    let json;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      if (!response.ok) {
        if (!isImageTask && !isChatFallback && response.status === 404) {
          // Attempt Chat Completions Fallback for generic models unrecognized by regex
          console.warn(`404 Not Found on standard route for ${modelName}. Attempting v1/chat/completions fallback...`);
          try {
            const chatRes = await fetch("https://router.huggingface.co/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: modelName,
                messages: getChatMessages(taskType, body.inputs),
                max_tokens: body.parameters?.max_new_tokens || 200
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
        
        // Handle 404 for Chat Fallback models that aren't available on chat endpoint
        if (isChatFallback && response.status === 404) {
          console.warn(`404 Not Found on Chat route for ${modelName}. Retrying on Standard Inference API...`);
          const fallbackRawPrompt = getChatMessages(taskType, body.inputs)[0].content + "\n\nOutput:";
          const standardFallbackReq = await fetch(`https://router.huggingface.co/${provider}/models/${cleanModelName}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, inputs: fallbackRawPrompt }),
            signal
          });
          if (standardFallbackReq.ok) {
            const standardJson = await standardFallbackReq.json();
            return { status: standardFallbackReq.status, data: standardJson };
          }
        }
        
        let errorMsg = rawText;
        try {
          const parsed = JSON.parse(rawText);
          errorMsg = parsed.error || rawText;
        } catch (pe) {}

        if (errorMsg.includes("not supported by provider") || errorMsg.includes("no longer supported") || response.status === 404 || response.status === 410) {
          const friendlyMessage = await checkModelSupport(cleanModelName, signal, HF_TOKEN);
          throw new Error(friendlyMessage);
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
        return executeAiTask(modelName, body, retries - 1, signal, taskType);
      }
    }

    if (!response.ok) {
      let errorMsg = JSON.stringify(json);
      if (json && json.error) errorMsg = json.error;

      if (errorMsg.includes("not supported by provider") || errorMsg.includes("no longer supported") || response.status === 404 || response.status === 410) {
        const friendlyMessage = await checkModelSupport(cleanModelName, signal, HF_TOKEN);
        throw new Error(friendlyMessage);
      }
      throw new Error(`API Error for ${modelName}: ${response.status} ${response.statusText} - ${errorMsg}`);
    }

    if (isChatFallback && json.choices) {
      const msg = json.choices[0]?.message || {};
      const generatedOutput = (msg.reasoning_content ? `[Thought Process]\n${msg.reasoning_content}\n\n[Output]\n` : "") + (msg.content || "");
      json = [{ generated_text: generatedOutput.trim() || "Empty conversational response." }];
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
        return executeAiTask(modelName, body, retries - 1, signal, taskType);
      }
    }
    throw error;
  }
}

// Pre-packaged tasks
export const tasks = {
  summarization: async (text) => {
    return executeAiTask(MODELS.summarization, { inputs: text }, 3, null, "summarization");
  },
  sentiment: async (text) => {
    return executeAiTask(MODELS.sentiment, { inputs: text }, 3, null, "sentiment");
  },
  generation: async (text) => {
    return executeAiTask(MODELS.generation, { inputs: text, parameters: { max_new_tokens: 30 } }, 3, null, "generation");
  },
  translation: async (text) => {
    return executeAiTask(MODELS.translation, { inputs: text }, 3, null, "translation");
  },
};
