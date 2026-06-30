import React, { useState, useEffect, useRef } from 'react';
import './index.css';
import { executeAiTask } from './services/api';

const AI_CONFIG = [
  {
    key: "summarization",
    name: "Text Summarization",
    endpoint: "facebook/bart-large-cnn",
    modelFriendly: "meta-llama/Llama-3.2-1B-Instruct",
    inputs: "Artificial Intelligence is transforming industries by enabling machines to learn from data, make decisions, and automate tasks. It is widely used in healthcare, finance, and education.",
    parameters: undefined,
    extractField: (data) => data[0]?.summary_text || "N/A",
    expectedField: "summary_text"
  },
  {
    key: "sentiment",
    name: "Sentiment Analysis",
    endpoint: "distilbert/distilbert-base-uncased-finetuned-sst-2-english",
    modelFriendly: "distilbert-base-uncased-finetuned-sst-2-english",
    inputs: "I love learning APIs and AI!",
    parameters: undefined,
    extractField: (data) => {
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const best = data[0].reduce((prev, current) => (prev.score > current.score) ? prev : current);
        return `${best.label} (Confidence: ${(best.score * 100).toFixed(2)}%)`;
      }
      return data[0]?.label || "N/A";
    },
    expectedField: "label"
  },
  {
    key: "generation",
    name: "Text Generation",
    endpoint: "openai-community/gpt2",
    modelFriendly: "gpt2",
    inputs: "The future of AI is",
    parameters: { max_new_tokens: 30 },
    extractField: (data) => data[0]?.generated_text || "N/A",
    expectedField: "generated_text"
  },
  {
    key: "translation",
    name: "Translation (EN → FR)",
    endpoint: "Helsinki-NLP/opus-mt-en-fr",
    modelFriendly: "opus-mt",
    inputs: "Hello, I am learning AI using APIs.",
    parameters: undefined,
    extractField: (data) => data[0]?.translation_text || "N/A",
    expectedField: "translation_text"
  }
];

const IMAGE_CONFIG = [
  {
    key: "flux",
    name: "Input Prompt Test",
    endpoint: "black-forest-labs/FLUX.1-schnell",
    modelFriendly: "FLUX.1-schnell",
    defaultPrompt: "A futuristic cyberpunk cityscape with neon lights, high resolution, 8k",
    expectedField: "image",
    testType: "prompt"
  },
  {
    key: "krea",
    name: "Negative Prompt Test",
    endpoint: "stabilityai/stable-diffusion-3-medium-diffusers",
    modelFriendly: "SD 3 Medium (Diffusers)",
    defaultPrompt: "A futuristic cyberpunk cityscape with neon lights, blurry, low quality, distorted anatomy, extra limbs",
    expectedField: "image",
    testType: "negative"
  },
  {
    key: "zimage",
    name: "Aspect Ratio Test",
    endpoint: "stabilityai/stable-diffusion-3-medium-diffusers",
    modelFriendly: "SD 3 Medium (Diffusers)",
    defaultPrompt: "A futuristic cyberpunk cityscape with neon lights, high resolution, 8k",
    defaultAspectRatio: "1:1",
    expectedField: "image",
    testType: "ratio"
  },
  {
    key: "sdxl",
    name: "Guidance Scale Test",
    endpoint: "stabilityai/stable-diffusion-3-medium-diffusers",
    modelFriendly: "SD 3 Medium (Diffusers)",
    defaultPrompt: "A futuristic cyberpunk cityscape with neon lights, high resolution, 8k",
    defaultGuidanceScale: 7.5,
    expectedField: "image",
    testType: "guidance"
  }
];

const getDimensions = (ratio) => {
  if (ratio === "16:9") return { width: 1024, height: 576 };
  if (ratio === "9:16") return { width: 576, height: 1024 };
  return { width: 1024, height: 1024 }; // 1:1 (Square)
};

/**
 * Generates a mock canvas image dynamically when Hugging Face API errors or is DNS-blocked.
 */
const generateFallbackImage = (prompt, negativePrompt, ratio, guidanceScale) => {
  const { width, height } = getDimensions(ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Radial color gradient matching tags
  const grad = ctx.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, Math.max(width, height) / 1.2);
  const isCyberpunk = /cyberpunk|neon|city/i.test(prompt);
  const isAbstract = guidanceScale < 6;

  if (isCyberpunk) {
    grad.addColorStop(0, "#ff007f"); // Pink
    grad.addColorStop(0.5, "#7b2cbf"); // Violet
    grad.addColorStop(1, "#03001e"); // Dark Blue
  } else if (isAbstract) {
    grad.addColorStop(0, "#3a86c8");
    grad.addColorStop(0.5, "#833ab4");
    grad.addColorStop(1, "#fd1d1d");
  } else {
    grad.addColorStop(0, "#00f2fe"); // Turquoise
    grad.addColorStop(0.5, "#4facfe"); // Slate
    grad.addColorStop(1, "#0c0d14"); // Cyber Black
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Cool abstract/cityscape overlay lines matching guidance scale
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 2;
  const shapeCount = Math.floor(guidanceScale * 3);
  for (let i = 0; i < shapeCount; i++) {
    ctx.beginPath();
    if (isAbstract) {
      ctx.moveTo(Math.random() * width, Math.random() * height);
      ctx.bezierCurveTo(
        Math.random() * width, Math.random() * height,
        Math.random() * width, Math.random() * height,
        Math.random() * width, Math.random() * height
      );
    } else {
      ctx.strokeRect(
        Math.random() * width, 
        height - (Math.random() * height * 0.7), 
        (Math.random() * 100) + 20, 
        height
      );
    }
    ctx.stroke();
  }

  // City neon dots
  if (isCyberpunk) {
    for (let i = 0; i < 5; i++) {
      ctx.shadowColor = Math.random() > 0.5 ? "#ff007f" : "#00f2fe";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 8 + 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // Banner details
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillRect(0, height - 90, width, 90);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 90);
  ctx.lineTo(width, height - 90);
  ctx.stroke();

  // Print info
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px monospace";
  ctx.fillText("SIMULATED MODEL OUTPUT (LOCAL FALLBACK DRAW)", 20, height - 60);

  ctx.fillStyle = "#888888";
  ctx.font = "12px monospace";
  ctx.fillText(`Prompt: ${prompt.substring(0, 45)}${prompt.length > 45 ? "..." : ""}`, 20, height - 40);
  ctx.fillText(`Ratio: ${ratio} (${width}x${height}) | CFG: ${guidanceScale}`, 20, height - 20);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
};

function App() {
  const [mode, setMode] = useState('text'); // 'text' or 'image'
  const [results, setResults] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [customModels, setCustomModels] = useState({});
  const [customInputs, setCustomInputs] = useState({});
  
  // Image mode custom states
  const [customPrompts, setCustomPrompts] = useState({});
  const [customNegativePrompts, setCustomNegativePrompts] = useState({});
  const [customAspectRatios, setCustomAspectRatios] = useState({});
  const [customGuidanceScales, setCustomGuidanceScales] = useState({});

  const abortControllerRef = useRef(null);

  const activeConfig = mode === 'text' ? AI_CONFIG : IMAGE_CONFIG;

  const cancelTasks = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
    
    setResults(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        if (updated[key].status === 'pending' || updated[key].status === 'loading') {
          updated[key] = {
            ...updated[key],
            status: 'cancelled',
            data: 'Execution cancelled by user.',
            raw: '{\n  "error": "Cancelled"\n}',
            statusCode: '-'
          };
        }
      });
      return updated;
    });
  };

  // Sync mode changes and clean up Object URLs
  useEffect(() => {
    Object.values(results).forEach(result => {
      if (result.isImage && result.data && result.data.startsWith('blob:')) {
        URL.revokeObjectURL(result.data);
      }
    });

    const init = {};
    activeConfig.forEach(task => {
      init[task.key] = { status: 'pending', data: null, statusCode: '-', raw: null };
    });
    setResults(init);

    return () => {
      setResults(prev => {
        Object.values(prev).forEach(result => {
          if (result.isImage && result.data && result.data.startsWith('blob:')) {
            URL.revokeObjectURL(result.data);
          }
        });
        return prev;
      });
    };
  }, [mode]);

  const runAllTasks = async () => {
    setIsRunning(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Clean up old URLs
    Object.values(results).forEach(result => {
      if (result.isImage && result.data && result.data.startsWith('blob:')) {
        URL.revokeObjectURL(result.data);
      }
    });

    const pendingState = {};
    activeConfig.forEach(task => {
      pendingState[task.key] = { status: 'loading', data: null, statusCode: '-', raw: null };
    });
    setResults(pendingState);

    for (const task of activeConfig) {
      if (signal.aborted) break;
      setResults(prev => ({
        ...prev,
        [task.key]: { ...prev[task.key], status: 'loading' }
      }));

      try {
        const targetEndpoint = customModels[task.key] && customModels[task.key].trim() !== ''
          ? customModels[task.key].trim()
          : task.endpoint;

        let payload;
        if (mode === 'text') {
          const targetInput = customInputs[task.key] !== undefined ? customInputs[task.key] : task.inputs;
          payload = { inputs: targetInput };
          if (task.parameters) payload.parameters = task.parameters;
        } else {
          const prompt = customPrompts[task.key] !== undefined ? customPrompts[task.key] : task.defaultPrompt;
          payload = { inputs: prompt };

          const parameters = {};
          if (task.testType === "negative") {
            const negativePrompt = customNegativePrompts[task.key] !== undefined ? customNegativePrompts[task.key] : task.defaultNegativePrompt;
            parameters.negative_prompt = negativePrompt;
          }
          if (task.testType === "ratio") {
            const ratio = customAspectRatios[task.key] !== undefined ? customAspectRatios[task.key] : task.defaultAspectRatio;
            const { width, height } = getDimensions(ratio);
            parameters.width = width;
            parameters.height = height;
          }
          if (task.testType === "guidance") {
            const guidanceScale = customGuidanceScales[task.key] !== undefined ? customGuidanceScales[task.key] : task.defaultGuidanceScale;
            parameters.guidance_scale = Number(guidanceScale);
          }

          if (Object.keys(parameters).length > 0) {
            payload.parameters = parameters;
          }
        }

        console.log(`Sending API Request to ${targetEndpoint}:`, payload);
        const start = Date.now();
        const response = await executeAiTask(targetEndpoint, payload, 3, signal, task.key);
        const time = Date.now() - start;
        console.log(`Received API Response from ${targetEndpoint}:`, response);

        let finalData;
        let isImage = false;

        if (response.isImage) {
          finalData = URL.createObjectURL(response.data);
          isImage = true;
        } else {
          try {
            finalData = task.extractField(response.data);
            if (finalData === "N/A" || !finalData) {
              const firstItem = Array.isArray(response.data) ? response.data[0] : response.data;
              if (firstItem && typeof firstItem === 'object') {
                finalData = firstItem.generated_text || firstItem.summary_text || firstItem.translation_text || firstItem.text || firstItem.answer;
              }
              if (!finalData) {
                finalData = JSON.stringify(response.data, null, 2);
              }
            }
          } catch (e) {
            finalData = JSON.stringify(response.data, null, 2);
          }
        }

        setResults(prev => ({
          ...prev,
          [task.key]: {
            status: 'success',
            data: finalData,
            isImage,
            statusCode: response.status,
            raw: response.isImage ? '[Binary Image Data]' : JSON.stringify(response.data, null, 2),
            timeMs: time,
            executedModel: targetEndpoint
          }
        }));
      } catch (error) {
        const isAbort = error.name === 'AbortError' || (error.message && error.message.includes('aborted'));
        console.error(`Error in ${task.name}:`, error);

        setResults(prev => ({
          ...prev,
          [task.key]: {
            status: isAbort ? 'cancelled' : 'error',
            data: isAbort ? 'Execution cancelled by user.' : error.message,
            statusCode: isAbort ? '-' : (error.message.includes('401') ? 401 : (error.message.includes('400') ? 400 : 500)),
            raw: JSON.stringify({ error: isAbort ? 'Cancelled' : error.message }),
            timeMs: 0,
            executedModel: customModels[task.key] || task.endpoint
          }
        }));
        if (isAbort) break;
      }
    }

    setIsRunning(false);
  };

  return (
    <div className="container">
      <header>
        <h1>ModelScope - AI Model Playground</h1>
        <p className="subtitle">Hugging Face Inference API Test Suite</p>
      </header>

      <main className="dashboard">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="mode-switch">
            <button
              className={mode === 'text' ? 'active' : ''}
              onClick={() => !isRunning && setMode('text')}
              disabled={isRunning}
            >
              Text Generation
            </button>
            <button
              className={mode === 'image' ? 'active' : ''}
              onClick={() => !isRunning && setMode('image')}
              disabled={isRunning}
            >
              Image Generation
            </button>
          </div>

          <section className="control-panel">
            <div>
              <h3>Execution Control</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                {mode === 'text' 
                  ? 'Run 4 text AI tasks sequentially using Bearer Auth with Hugging Face API.' 
                  : 'Run 4 image AI models sequentially using Bearer Auth with Hugging Face API.'
                }
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={isRunning ? cancelTasks : runAllTasks}
              style={isRunning ? { backgroundColor: 'transparent', borderColor: 'var(--error)', color: 'var(--error)' } : {}}
            >
              {isRunning ? '⏹ Cancel Execution' : '▶ Run API Test Suite'}
            </button>
          </section>
        </div>

        <section className="results-grid">
          {activeConfig.map((task) => {
            const result = results[task.key] || { status: 'pending', raw: null, executedModel: '-' };
            return (
              <div key={task.key} className="task-card">
                <div className="task-header">
                  <span className="task-title">{task.name}</span>
                  <span className={`badge ${result.status}`}>
                    {result.status}
                  </span>
                </div>

                <div className="input-group">
                  <label htmlFor={`model-${task.key}`}>Test custom model (Optional)</label>
                  <input
                    id={`model-${task.key}`}
                    type="text"
                    placeholder={task.endpoint}
                    value={customModels[task.key] || ''}
                    onChange={(e) => setCustomModels({ ...customModels, [task.key]: e.target.value })}
                    className="model-input"
                    disabled={isRunning}
                  />
                </div>

                {mode === 'text' ? (
                  <div className="input-group">
                    <label htmlFor={`input-${task.key}`}>Input Query</label>
                    <textarea
                      id={`input-${task.key}`}
                      placeholder={task.inputs}
                      value={customInputs[task.key] !== undefined ? customInputs[task.key] : task.inputs}
                      onChange={(e) => setCustomInputs({ ...customInputs, [task.key]: e.target.value })}
                      className="model-input"
                      disabled={isRunning}
                      style={{ resize: 'vertical', minHeight: '60px', lineHeight: '1.4' }}
                    />
                  </div>
                ) : (
                  <>
                    <div className="input-group">
                      <label htmlFor={`prompt-${task.key}`}>Input Prompt</label>
                      <textarea
                        id={`prompt-${task.key}`}
                        placeholder={task.defaultPrompt}
                        value={customPrompts[task.key] !== undefined ? customPrompts[task.key] : task.defaultPrompt}
                        onChange={(e) => setCustomPrompts({ ...customPrompts, [task.key]: e.target.value })}
                        className="model-input"
                        disabled={isRunning}
                        style={{ resize: 'vertical', minHeight: '60px', lineHeight: '1.4' }}
                      />
                    </div>

                    {task.testType === "ratio" && (
                      <div className="input-group">
                        <label htmlFor={`ratio-${task.key}`}>Aspect Ratio / Dimensions</label>
                        <select
                          id={`ratio-${task.key}`}
                          value={customAspectRatios[task.key] !== undefined ? customAspectRatios[task.key] : task.defaultAspectRatio}
                          onChange={(e) => setCustomAspectRatios({ ...customAspectRatios, [task.key]: e.target.value })}
                          className="model-select"
                          disabled={isRunning}
                        >
                          <option value="1:1">1:1 (Square)</option>
                          <option value="16:9">16:9 (Landscape)</option>
                          <option value="9:16">9:16 (Portrait)</option>
                        </select>
                      </div>
                    )}

                    {task.testType === "guidance" && (
                      <div className="input-group slider-container">
                        <div className="slider-header">
                          <span>Guidance Scale / CFG Scale</span>
                          <span className="slider-value">
                            {customGuidanceScales[task.key] !== undefined ? customGuidanceScales[task.key] : task.defaultGuidanceScale}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="20"
                          step="0.5"
                          value={customGuidanceScales[task.key] !== undefined ? customGuidanceScales[task.key] : task.defaultGuidanceScale}
                          onChange={(e) => setCustomGuidanceScales({ ...customGuidanceScales, [task.key]: parseFloat(e.target.value) })}
                          className="model-slider"
                          disabled={isRunning}
                        />
                        <span className="slider-hint">
                          {(() => {
                            const val = customGuidanceScales[task.key] !== undefined ? customGuidanceScales[task.key] : task.defaultGuidanceScale;
                            if (val < 6) return "Low scale: More creative, organic, and abstract interpretation.";
                            if (val > 12) return "High scale: Strict adherence to prompt tags, but risk of quality cost.";
                            return "Balanced: Strong prompt adherence with good quality.";
                          })()}
                        </span>
                      </div>
                    )}
                  </>
                )}

                <div className="output-container">
                  {result.status === 'pending' && <span style={{ color: '#888' }}>Awaiting execution...</span>}
                  {result.status === 'loading' && <span style={{ color: '#fff' }}>Initializing model & fetching response...</span>}
                  {result.status === 'cancelled' && <span style={{ color: 'var(--error)' }}>Execution cancelled by user.</span>}
                  {result.status === 'success' && (
                    result.isImage ? (
                      <div className="generated-image-container">
                        <img src={result.data} alt="AI Generated Output" className="generated-image" />
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '1rem' }}>
                        {result.data}
                      </div>
                    )
                  )}
                  {result.status === 'error' && (
                    <div className="error-container">
                      <div className="error-text">
                        {result.data || result.raw}
                      </div>
                      <div className="error-fixes-table">
                        <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: '#fff', fontWeight: 500 }}>Common Errors and Fixes</div>
                        <table className="observation-table error-table">
                          <thead>
                            <tr>
                              <th>Error</th>
                              <th>Cause</th>
                              <th>Fix</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>401 Unauthorized</td>
                              <td>Invalid or missing token</td>
                              <td>Verify Bearer token</td>
                            </tr>
                            <tr>
                              <td>400 Bad Request</td>
                              <td>Incorrect JSON format</td>
                              <td>Correct the request body</td>
                            </tr>
                            <tr>
                              <td>Slow response</td>
                              <td>Model cold start</td>
                              <td>Retry after a few seconds</td>
                            </tr>
                            <tr>
                              <td>Empty/delayed</td>
                              <td>Model loading</td>
                              <td>Wait and retry</td>
                            </tr>
                            <tr>
                              <td style={{ color: 'var(--error)' }}>404 Not Found</td>
                              <td>Model not hosted on Free Serverless API or missing organization prefix (e.g. meta-llama/)</td>
                              <td>Use a hosted model string exactly as expected by the router</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Observation Table */}
        <section style={{ marginTop: '2rem', width: '100%', overflow: 'hidden' }}>
          <h2 style={{ color: '#fff', marginBottom: '1rem' }}>Observation Table</h2>
          <div className="table-responsive">
            <table className="observation-table">
              <thead>
                <tr>
                  <th>Task / Model</th>
                  <th>Endpoint</th>
                  <th>Method</th>
                  <th>Status Code</th>
                  <th>Output Field</th>
                </tr>
              </thead>
              <tbody>
                {activeConfig.map((task) => {
                  const result = results[task.key] || { statusCode: '-', executedModel: '-' };
                  return (
                    <tr key={task.key}>
                      <td>{task.name}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>
                        {result.executedModel && result.executedModel !== '-' ? result.executedModel.split('/').pop() : task.modelFriendly}
                      </td>
                      <td>POST</td>
                      <td>
                        <span style={{
                          color: result.statusCode === 200 ? 'var(--success)' :
                            result.statusCode === 'Fallback' ? 'var(--success)' :
                            result.statusCode === '-' ? 'var(--text-secondary)' : 'var(--error)'
                        }}>
                          {result.statusCode}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{task.expectedField}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>Built securely with React & Hugging Face Inference API</p>
      </footer>
    </div>
  );
}

export default App;
