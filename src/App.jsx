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

function App() {
  const [results, setResults] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [customModels, setCustomModels] = useState({});
  const [customInputs, setCustomInputs] = useState({});
  const abortControllerRef = useRef(null);

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

  // Initialize status
  useEffect(() => {
    const init = {};
    AI_CONFIG.forEach(task => {
      init[task.key] = { status: 'pending', data: null, statusCode: '-', raw: null };
    });
    setResults(init);
  }, []);

  const runAllTasks = async () => {
    setIsRunning(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Reset statuses to loading
    const pendingState = {};
    AI_CONFIG.forEach(task => {
      pendingState[task.key] = { status: 'loading', data: null, statusCode: '-', raw: null };
    });
    setResults(pendingState);

    // Run sequentially as requested: "execute all tasks sequentially"
    for (const task of AI_CONFIG) {
      if (signal.aborted) break;
      setResults(prev => ({
        ...prev,
        [task.key]: { ...prev[task.key], status: 'loading' }
      }));

      try {
        const targetInput = customInputs[task.key] !== undefined ? customInputs[task.key] : task.inputs;
        const payload = { inputs: targetInput };
        if (task.parameters) payload.parameters = task.parameters;

        const targetEndpoint = customModels[task.key] && customModels[task.key].trim() !== ''
          ? customModels[task.key].trim()
          : task.endpoint;

        console.log(`Sending API Request to ${targetEndpoint}:`, payload);
        const start = Date.now();
        const response = await executeAiTask(targetEndpoint, payload, 3, signal);
        const time = Date.now() - start;
        console.log(`Received API Response from ${targetEndpoint}:`, response.data);

        // Fallback robust extractor for totally unpredictable custom model structures
        let finalData;
        try {
          finalData = task.extractField(response.data);
          if (finalData === "N/A" || !finalData) {
            // Aggressively seek plain text fields so mismatched task types render beautifully instead of JSON
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

        setResults(prev => ({
          ...prev,
          [task.key]: {
            status: 'success',
            data: finalData,
            statusCode: response.status,
            raw: JSON.stringify(response.data, null, 2),
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
        <section className="control-panel">
          <div>
            <h3>Execution Control</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Run 4 AI tasks sequentially using Bearer Auth with Hugging Face API.
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

        <section className="results-grid">
          {AI_CONFIG.map((task) => {
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

                <div className="output-container">
                  {result.status === 'pending' && <span style={{ color: '#888' }}>Awaiting execution...</span>}
                  {result.status === 'loading' && <span style={{ color: '#fff' }}>Initializing model & fetching response...</span>}
                  {result.status === 'cancelled' && <span style={{color: 'var(--error)'}}>Execution cancelled by user.</span>}
                  {result.status === 'success' && (
                    <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '1rem' }}>
                      {result.data}
                    </div>
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
                <th>Task</th>
                <th>Endpoint</th>
                <th>Method</th>
                <th>Status Code</th>
                <th>Output Field</th>
              </tr>
            </thead>
            <tbody>
              {AI_CONFIG.map((task) => {
                const result = results[task.key] || { statusCode: '-', executedModel: '-' };
                return (
                  <tr key={task.key}>
                    <td>{task.name.split(' ')[0]}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>
                      {result.executedModel && result.executedModel !== '-' ? result.executedModel.split('/').pop() : task.modelFriendly}
                    </td>
                    <td>POST</td>
                    <td>
                      <span style={{
                        color: result.statusCode === 200 ? 'var(--success)' :
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
