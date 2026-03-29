# MemoFlux mobile

MemoFlux is an iPhone-first personal reporting app:

- record or import audio
- generate a structured brief
- review the evidence
- export a polished PDF

## Current product state

The app now supports:

- local session persistence with `AsyncStorage`
- recording on iPhone
- importing external audio
- English and French report output
- brief and detailed report modes
- PDF export
- transcript and response caching through the backend

## Daily usage flow

1. Capture a short note or import a meeting recording.
2. Generate the report once.
3. Review the brief and switch to the detailed version if needed.
4. Mark the note `Reviewed` or `Final`.
5. Export the PDF.

## Local development

```bash
npm install
npx expo start
```

Set a backend URL in `.env` when you want live processing:

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-backend.example.com
```

## Use without a PC

To use MemoFlux as a real personal app on iPhone without opening local terminals every time, you need two things:

1. a hosted backend for transcription and report generation
2. an installed iPhone build

## Web app route without Apple Developer

If you do not want to pay for Apple Developer, MemoFlux can now also run as a hosted web app:

1. deploy the backend from `../server`
2. deploy the Expo web build as a static site
3. open it in Safari on iPhone
4. use `Share > Add to Home Screen`

This gives you a personal app-like experience without TestFlight or the App Store. The browser version also supports importing audio, generating reports, and saving the final report through the browser print dialog as PDF.

### Hosted backend

The backend in `../server` is now ready for container deployment through the included `Dockerfile`.

Once deployed, point the app to the hosted URL:

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-backend.example.com
```

### iPhone build

This project now includes `eas.json` for cloud builds. A typical path is:

```bash
npx eas-cli login
npx eas build --platform ios --profile production
```

Then install through TestFlight or internal distribution. After that, the app can run on your iPhone without your PC being on.

For production builds, the app uses `app.config.ts`, so you can inject values like:

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-backend.example.com
IOS_BUNDLE_IDENTIFIER=com.yourname.memoflux
```

## Important limitation

The app cannot safely call OpenAI directly from the iPhone with your secret key embedded in the binary. For real standalone personal use, the correct architecture is:

- iPhone app
- hosted MemoFlux backend
- OpenAI API behind the backend

## Cost note

The biggest cost driver is transcription, not PDF export. The backend now reduces cost by:

- caching transcripts for the same audio
- caching final responses for the same audio + template + report language + title
- using `gpt-4.1-mini` by default for report generation
