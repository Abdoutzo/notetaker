# MemoFlux deployment

This project is ready for a personal production setup with:

- a hosted backend
- an iPhone build installed through TestFlight

## 1. Deploy the backend

Recommended path: Render using the included `render.yaml`.

### Render

1. Push this repository to GitHub.
2. Create a new Render Blueprint from the repository root.
3. Render will detect `render.yaml`.
4. Set the missing secret:

```bash
OPENAI_API_KEY=<SECRET>
```

5. Deploy the web service.
6. Copy the public backend URL, for example:

```bash
https://memo-flux-server.onrender.com
```

7. Test:

```bash
GET https://memo-flux-server.onrender.com/health
```

You should receive a JSON health response.

## 2. Build the iPhone app

MemoFlux now uses `app.config.ts` and `eas.json`.

### Required accounts

- Expo account
- Apple Developer account

### Login

```bash
cd mobile
npx eas-cli login
```

### Set build-time environment

Use a unique iOS bundle identifier and your hosted backend URL.

Example PowerShell session:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL="https://memo-flux-server.onrender.com"
$env:IOS_BUNDLE_IDENTIFIER="com.yourname.memoflux"
```

### Build for TestFlight

```bash
npx eas-cli build --platform ios --profile production
```

When the build completes, submit it:

```bash
npx eas-cli submit --platform ios --profile production
```

If Expo asks to manage Apple credentials, the easiest path is usually to let Expo handle them.

## 3. Install and use without a PC

After the TestFlight build is installed on your iPhone:

- the app talks to your hosted backend
- you no longer need local terminals
- your PC does not need to stay on

## 4. Recommended first live test

1. Open the TestFlight build on iPhone.
2. Record a short 10 to 20 second note.
3. Generate the report once.
4. Confirm the PDF export.
5. Only then move to longer recordings.

## 5. Cost control reminders

- The first transcription is the expensive part.
- Reusing the same audio is now cheaper because transcript and response caching are enabled.
- Report generation uses `gpt-4.1-mini` by default.
