# Backend contract for real AI processing

## Why the backend exists

Do not put the model API key inside the iPhone app. The mobile client should upload audio to your backend, and the backend should:

1. store the raw file
2. transcribe it
3. generate a structured report
4. return a clean JSON payload to the app

## Recommended pipeline

1. `speech-to-text`
   Use the OpenAI speech-to-text guide and transcription endpoints for the raw audio step.
2. `structured extraction`
   Feed the transcript into a second model call with Structured Outputs so the result matches a stable JSON schema.
3. `review`
   The app shows the report as editable content before export.

## Suggested endpoint

`POST /v1/reports/process`

Multipart form fields:

- `file`: audio file
- `sourceUrl`: optional remote HTTP(S) audio URL for built-in demos or server-side fetch
- `template`: `meeting | field | memo`
- `title`: optional title from the user
- `recordedAt`: ISO timestamp
- `reportLanguage`: `fr | en`

Response body:

```json
{
  "transcript": [
    {
      "id": "seg_1",
      "speaker": "You",
      "startMs": 0,
      "endMs": 18200,
      "text": "..."
    }
  ],
  "sourceLanguage": "en",
  "report": {
    "title": "Client visit recap",
    "brief": {
      "summary": "...",
      "keyTakeaways": ["..."],
      "actionItems": [
        {
          "id": "action_1",
          "text": "...",
          "owner": "You",
          "dueLabel": "Tomorrow",
          "timestampMs": 42000
        }
      ],
      "decisions": [
        {
          "id": "decision_1",
          "text": "...",
          "timestampMs": 58000
        }
      ],
      "risks": [
        {
          "id": "risk_1",
          "text": "...",
          "mitigation": "..."
        }
      ],
      "followUpQuestions": ["..."]
    },
    "detailed": {
      "executiveSummary": "...",
      "sections": [
        {
          "id": "context",
          "title": "Context and objective",
          "paragraphs": ["..."],
          "bullets": ["..."]
        }
      ],
      "verificationChecklist": ["..."]
    }
  }
}
```

## Notes for implementation

- keep raw audio in object storage
- preserve timestamps so every action or decision can be checked against the transcript
- store the transcript separately from the generated report
- log model version and prompt version for auditability
- keep template prompts server-side
- for longer source files, compress or split server-side before transcription so you stay under transcription size limits

## Official references

- OpenAI speech-to-text: https://platform.openai.com/docs/guides/speech-to-text
- OpenAI structured outputs: https://platform.openai.com/docs/guides/structured-outputs
- Apple AVFoundation media authorization: https://developer.apple.com/documentation/avfoundation/requesting-authorization-to-capture-and-save-media
- Apple background URLSession: https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background%28withidentifier%3A%29
