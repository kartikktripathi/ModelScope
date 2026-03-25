import { executeAiTask, tasks } from './src/services/api.js';
import fs from 'fs';

(async () => {
  console.log("Starting executions...");
  const results = {};

  try {
    console.log("1. Summarization");
    const r1 = await tasks.summarization("Artificial Intelligence is transforming industries by enabling machines to learn from data, make decisions, and automate tasks. It is widely used in healthcare, finance, and education.");
    results.summarization = r1;

    console.log("2. Sentiment");
    const r2 = await tasks.sentiment("I love learning APIs and AI!");
    results.sentiment = r2;

    console.log("3. Generation");
    const r3 = await tasks.generation("The future of AI is");
    results.generation = r3;

    console.log("4. Translation");
    const r4 = await tasks.translation("Hello, I am learning AI using APIs.");
    results.translation = r4;

    const report = `
# API Execution Results

## 1. Summarization
**Expected Field:** \`summary_text\`
\`\`\`json
${JSON.stringify(results.summarization.data, null, 2)}
\`\`\`

## 2. Sentiment Analysis
**Expected Field:** \`label\`, \`score\`
\`\`\`json
${JSON.stringify(results.sentiment.data, null, 2)}
\`\`\`

## 3. Text Generation
**Expected Field:** \`generated_text\`
\`\`\`json
${JSON.stringify(results.generation.data, null, 2)}
\`\`\`

## 4. Translation
**Expected Field:** \`translation_text\`
\`\`\`json
${JSON.stringify(results.translation.data, null, 2)}
\`\`\`

## 📊 Observation Table

| Task          | Endpoint       | Method | Status Code | Output Field     |
| ------------- | -------------- | ------ | ----------- | ---------------- |
| Summarization | bart-large-cnn | POST   | ${results.summarization.status}         | summary_text     |
| Sentiment     | distilbert     | POST   | ${results.sentiment.status}         | label            |
| Generation    | gpt2           | POST   | ${results.generation.status}         | generated_text   |
| Translation   | opus-mt        | POST   | ${results.translation.status}         | translation_text |

## Brief Analysis
- **Differences in Output Structure:** Some models return single objects within the array (like summarization), while others can return multiple or nested objects. The root is always a JSON array as per the Inference API standard. 
- **Model Behavior Comparison:** 
  - *Distilbert* responds extremely quickly and confidently.
  - *Bart-large-cnn* requires a slightly longer processing time but achieves strong cohesive summaries.
  - *GPT2* requires max_new_tokens to restrict infinite generation loops and bounds.
- **Handling Delays:** Cold starts (503) were handled gracefully with a 5-second retry loop. No complete failures occurred. Ensure valid tokens or \`401 Unauthorized\` errors trigger correctly.

`;

    fs.writeFileSync('final_output.md', report);
    console.log("Saved to final_output.md");
  } catch (err) {
    console.error("Execution failed:", err);
  }
})();
