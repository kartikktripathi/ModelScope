
# API Execution Results

## 1. Summarization
**Expected Field:** `summary_text`
```json
[
  {
    "summary_text": "Artificial Intelligence is transforming industries by enabling machines to learn from data, make decisions, and automate tasks. It is widely used in healthcare, finance, and education, and is also being used in the military and law enforcement. It can also be used to improve the quality of life for people and businesses."
  }
]
```

## 2. Sentiment Analysis
**Expected Field:** `label`, `score`
```json
[
  [
    {
      "label": "POSITIVE",
      "score": 0.9990987777709961
    },
    {
      "label": "NEGATIVE",
      "score": 0.0009012204245664179
    }
  ]
]
```

## 3. Text Generation
**Expected Field:** `generated_text`
```json
[
  {
    "generated_text": "The future of AI is shaping up to be an intelligent landscape marked by autonomous decision making, profound data analysis, and unprecedented efficiency."
  }
]
```

## 4. Translation
**Expected Field:** `translation_text`
```json
[
  {
    "translation_text": "Bonjour, j'apprends l'IA à l'aide d'API."
  }
]
```

## 📊 Observation Table

| Task          | Endpoint       | Method | Status Code | Output Field     |
| ------------- | -------------- | ------ | ----------- | ---------------- |
| Summarization | bart-large-cnn | POST   | 200         | summary_text     |
| Sentiment     | distilbert     | POST   | 200         | label            |
| Generation    | gpt2           | POST   | 200         | generated_text   |
| Translation   | opus-mt        | POST   | 200         | translation_text |

## Brief Analysis
- **Differences in Output Structure:** Some models return single objects within the array (like summarization), while others can return multiple or nested objects. The root is always a JSON array as per the Inference API standard. 
- **Model Behavior Comparison:** 
  - *Distilbert* responds extremely quickly and confidently.
  - *Bart-large-cnn* requires a slightly longer processing time but achieves strong cohesive summaries.
  - *GPT2* requires max_new_tokens to restrict infinite generation loops and bounds.
- **Handling Delays:** Cold starts (503) were handled gracefully with a 5-second retry loop. No complete failures occurred. Ensure valid tokens or `401 Unauthorized` errors trigger correctly.

