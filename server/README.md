# MemoFlux server

MemoFlux server turns audio into:

- a diarized transcript
- a structured brief
- a detailed export-ready report

## Stack

- Node + Express
- OpenAI speech-to-text
- OpenAI structured outputs
- `ffmpeg-static` for normalization and chunking

## Run locally

```bash
cd server
npm install
copy .env.example .env
```

Minimum config:

```bash
OPENAI_API_KEY=<SECRET>
```

Recommended cost-aware config:

```bash
PORT=8787
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe-diarize
OPENAI_REPORT_MODEL=gpt-4.1-mini
MAX_UPLOAD_MB=80
SEGMENT_SECONDS=600
TRANSCRIPTION_CONCURRENCY=2
ENABLE_REMOTE_SOURCE_URLS=true
```

Start the server:

```bash
npm run dev
```

Health check:

```bash
GET /health
```

Main endpoint:

```bash
POST /v1/reports/process
```

## Cost controls already included

- transcript cache for the same audio
- response cache for the same audio + template + language + title
- smaller, cheaper report model by default
- chunked transcription with limited parallelism

The heaviest cost driver remains speech-to-text. Reusing a cached transcript is the strongest savings lever.

## Deploy for personal no-PC use

This folder now includes:

- `Dockerfile`
- `.dockerignore`

So you can deploy it to a container-friendly host such as Render, Railway, Fly.io, or another Docker-based provider.

Deployment shape:

1. create a web service from `server/`
2. set the environment variables from `.env.example`
3. expose the service publicly
4. point the mobile app to that public URL

## Connect the iPhone app

Set the mobile environment variable:

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-backend.example.com
```

The mobile app will then work against the hosted backend instead of your local machine.
