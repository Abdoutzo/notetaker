import * as db from './db.js';
import { MeetingRecorder, extensionFor } from './recorder.js';
import { splitAudioFile } from './audio-file.js';
import { transcribe, withRetry, summarizeMeeting, listGroqModels, listGeminiModels } from './api.js';
import { cleanWhisperSegments, buildTranscript, transcriptToText, formatClock, renderMarkdown } from './transcript.js';

const $ = (selector) => document.querySelector(selector);

const params = new URLSearchParams(location.search);
// ?segment=20 permet de tester le découpage sans attendre 5 minutes.
const SEGMENT_SECONDS = Number(params.get('segment')) || 300;
const MAX_RECORDING_SECONDS = 2 * 3600;

// ---------- Réglages ----------

const SETTINGS_KEY = 'scribe.settings';
const DEFAULT_SETTINGS = {
  groqKey: '',
  geminiKey: '',
  language: 'fr',
  vocabulary: '',
  meLabel: 'Moi',
  themLabel: 'Interlocuteur',
  summaryProvider: 'groq',
  summaryLanguage: 'français',
  whisperModel: 'whisper-large-v3-turbo',
  groqChatModel: 'llama-3.3-70b-versatile',
  geminiModel: 'gemini-flash-latest',
};
// Modèles de repli si ceux par défaut disparaissent du catalogue.
const PREFERRED_GROQ_CHAT = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-32b'];
const PREFERRED_WHISPER = ['whisper-large-v3-turbo', 'whisper-large-v3'];

let settings = loadSettings();

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(next) {
  settings = next;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // stockage indisponible (navigation privée) : réglages valables pour cette session seulement
  }
  applyLabels();
}

// ---------- État ----------

const state = {
  mode: 'pc',
  recorder: null,
  streams: [],
  stopping: false,
  currentId: null,
  liveStatus: new Map(), // sessionId -> message affiché sous la barre de progression
  queues: new Map(), // sessionId -> promesse (traitement séquentiel par réunion)
};

const MODE_LABELS = { pc: 'Réunion PC', phone: 'Appel téléphone', upload: 'Fichier importé' };

// ---------- Utilitaires UI ----------

function show(el, visible) {
  el.hidden = !visible;
}

function showError(el, message) {
  el.textContent = message || '';
  show(el, Boolean(message));
}

function formatDate(ts) {
  return new Date(ts).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function defaultTitle() {
  return `Réunion du ${new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
}

function applyLabels() {
  $('.meter[data-track="me"] .meter-label').textContent = settings.meLabel || 'Moi';
  $('.meter[data-track="them"] .meter-label').textContent = settings.themLabel || 'Interlocuteur';
}

function warnUnload(event) {
  event.preventDefault();
  event.returnValue = '';
}

function setBusyGuard(active) {
  if (active) window.addEventListener('beforeunload', warnUnload);
  else window.removeEventListener('beforeunload', warnUnload);
}

// ---------- Choix du mode ----------

function setMode(mode) {
  state.mode = mode;
  for (const tab of document.querySelectorAll('.tabs [data-mode]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
  }
  for (const help of document.querySelectorAll('[data-help]')) show(help, help.dataset.help === mode);
  show($('#record-controls'), mode !== 'upload');
  show($('#upload-controls'), mode === 'upload');
}

// ---------- Enregistrement ----------

function describeMediaError(err) {
  if (err?.userMessage) return err.userMessage;
  switch (err?.name) {
    case 'NotAllowedError':
      return "Autorisation refusée ou partage annulé. Autorise le micro (icône dans la barre d'adresse) puis réessaie.";
    case 'NotFoundError':
      return 'Aucun micro détecté.';
    case 'NotReadableError':
      return 'Le micro est utilisé par une autre application ou bloqué par le système.';
    default:
      return `Impossible de démarrer l'enregistrement : ${err?.message || err}`;
  }
}

function userError(message) {
  return Object.assign(new Error(message), { userMessage: message });
}

function stopStreams(streams) {
  for (const stream of streams) stream.getTracks().forEach((t) => t.stop());
}

async function openStreams(mode) {
  const streams = [];
  try {
    if (mode === 'pc') {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw userError("Ce navigateur ne sait pas capturer le son du PC. Utilise Chrome ou Edge sur ordinateur (ou le mode « Appel sur téléphone »).");
      }
      const display = await navigator.mediaDevices.getDisplayMedia({
        // La vidéo est obligatoire pour Chrome mais inutile ici : on la bride.
        video: { frameRate: { ideal: 1, max: 5 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      });
      streams.push(display);
      const systemAudio = display.getAudioTracks();
      if (!systemAudio.length) {
        throw userError(
          "Aucun son partagé. Relance et coche « Partager aussi l'audio du système » (écran entier) ou « Partager l'audio de l'onglet ». Une fenêtre seule ne transmet pas le son.",
        );
      }
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streams.push(mic);
      return {
        streams,
        tracks: [
          { id: 'me', stream: mic },
          { id: 'them', stream: new MediaStream(systemAudio) },
        ],
      };
    }
    // Téléphone sur haut-parleur : on garde le son le plus brut possible.
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
    streams.push(mic);
    return { streams, tracks: [{ id: 'mix', stream: mic }] };
  } catch (err) {
    stopStreams(streams);
    throw err;
  }
}

async function startRecording() {
  showError($('#record-error'), '');
  if (!settings.groqKey) {
    openSettings("Ajoute d'abord ta clé Groq (gratuite) pour pouvoir transcrire.");
    return;
  }
  if (!window.MediaRecorder) {
    showError($('#record-error'), "Ce navigateur ne permet pas d'enregistrer. Utilise Chrome ou Edge.");
    return;
  }

  $('#start-btn').disabled = true;
  let opened;
  try {
    opened = await openStreams(state.mode);
  } catch (err) {
    showError($('#record-error'), describeMediaError(err));
    $('#start-btn').disabled = false;
    return;
  }

  const typedTitle = $('#title-input').value.trim();
  const session = {
    id: crypto.randomUUID(),
    title: typedTitle || defaultTitle(),
    titleIsDefault: !typedTitle,
    createdAt: Date.now(),
    mode: state.mode,
    durationSec: 0,
    status: 'recording',
    labels: state.mode === 'pc' ? { me: settings.meLabel || 'Moi', them: settings.themLabel || 'Interlocuteur' } : {},
    transcript: [],
    summary: '',
    error: '',
  };
  await db.putSession(session);

  const recorder = new MeetingRecorder({
    tracks: opened.tracks,
    segmentSeconds: SEGMENT_SECONDS,
    onSegment: (segment) => saveRecordedSegment(session.id, segment),
    onTick: updateMeters,
    // Partage arrêté depuis la barre de Chrome ou micro débranché.
    onEnded: () => stopRecording(),
  });
  try {
    await recorder.start();
  } catch (err) {
    stopStreams(opened.streams);
    await db.deleteSession(session.id);
    showError($('#record-error'), describeMediaError(err));
    $('#start-btn').disabled = false;
    return;
  }

  state.recorder = recorder;
  state.streams = opened.streams;
  state.recordingId = session.id;
  setBusyGuard(true);
  $('#title-input').value = '';
  setRecordingUi(true, state.mode);
  await openSession(session.id);
  refreshHistory();
}

function setRecordingUi(recording, mode) {
  $('#start-btn').disabled = recording;
  show($('#start-btn'), !recording);
  show($('#stop-btn'), recording);
  $('#stop-btn').disabled = false;
  show($('#timer'), recording);
  $('#timer').classList.toggle('recording', recording);
  show($('#meters'), recording);
  for (const tab of document.querySelectorAll('.tabs [data-mode]')) tab.disabled = recording;
  if (recording) {
    $('#timer').textContent = '00:00';
    for (const meter of document.querySelectorAll('.meter')) {
      const track = meter.dataset.track;
      show(meter, mode === 'pc' ? track !== 'mix' : track === 'mix');
    }
  }
}

function updateMeters({ elapsed, levels }) {
  $('#timer').textContent = formatClock(elapsed);
  for (const [track, rms] of Object.entries(levels)) {
    const bar = $(`.meter[data-track="${track}"] .bar i`);
    if (bar) bar.style.width = `${Math.min(100, Math.sqrt(rms) * 220)}%`;
  }
  if (elapsed >= MAX_RECORDING_SECONDS) stopRecording();
}

async function saveRecordedSegment(sessionId, segment) {
  const tooShort = segment.durationSec < 0.5 || segment.blob.size < 1000;
  await db.putChunk({
    id: `${sessionId}:${String(segment.index).padStart(4, '0')}:${segment.track}`,
    sessionId,
    track: segment.track,
    index: segment.index,
    startSec: segment.startSec,
    durationSec: segment.durationSec,
    blob: segment.blob,
    mime: segment.blob.type,
    // Piste restée muette (ex. micro coupé tout le segment) : inutile de la transcrire.
    status: tooShort || segment.voiced === false ? 'skipped' : 'pending',
    segments: [],
    error: '',
  });
  if (!state.stopping) scheduleTranscription(sessionId);
  else refreshSessionView(sessionId);
}

async function stopRecording() {
  const recorder = state.recorder;
  if (!recorder || state.stopping) return;
  state.stopping = true;
  $('#stop-btn').disabled = true;
  $('#stop-btn').textContent = 'Finalisation…';
  const sessionId = state.recordingId;
  try {
    const durationSec = await recorder.stop();
    await db.patchSession(sessionId, { durationSec, status: 'processing' });
  } finally {
    stopStreams(state.streams);
    state.recorder = null;
    state.streams = [];
    state.stopping = false;
    $('#stop-btn').textContent = 'Arrêter et générer le compte-rendu';
    setRecordingUi(false);
  }
  await finalizeSession(sessionId);
}

// ---------- Import de fichier ----------

async function transcribeFile() {
  showError($('#record-error'), '');
  const file = $('#file-input').files[0];
  if (!file) {
    showError($('#record-error'), "Choisis d'abord un fichier audio.");
    return;
  }
  if (!settings.groqKey) {
    openSettings("Ajoute d'abord ta clé Groq (gratuite) pour pouvoir transcrire.");
    return;
  }

  const typedTitle = $('#title-input').value.trim();
  const session = {
    id: crypto.randomUUID(),
    title: typedTitle || file.name.replace(/\.[^.]+$/, ''),
    titleIsDefault: !typedTitle,
    createdAt: Date.now(),
    mode: 'upload',
    durationSec: 0,
    status: 'processing',
    labels: {},
    transcript: [],
    summary: '',
    error: '',
  };
  await db.putSession(session);
  $('#upload-btn').disabled = true;
  setBusyGuard(true);
  await openSession(session.id);
  refreshHistory();
  setLiveStatus(session.id, 'Lecture et découpage du fichier audio…');

  try {
    const { durationSec, pieces } = await splitAudioFile(file);
    for (const piece of pieces) {
      await db.putChunk({
        id: `${session.id}:${String(piece.index).padStart(4, '0')}:mix`,
        sessionId: session.id,
        track: 'mix',
        index: piece.index,
        startSec: piece.startSec,
        durationSec: piece.durationSec,
        blob: piece.blob,
        mime: 'audio/wav',
        status: 'pending',
        segments: [],
        error: '',
      });
    }
    await db.patchSession(session.id, { durationSec });
    $('#file-input').value = '';
    $('#title-input').value = '';
  } catch (err) {
    console.error(err);
    await db.patchSession(session.id, {
      status: 'error',
      error: `Impossible de lire ce fichier audio (${err.message || err}). Essaie un format courant : mp3, m4a, wav.`,
    });
    setLiveStatus(session.id, '');
    $('#upload-btn').disabled = false;
    setBusyGuard(false);
    refreshSessionView(session.id);
    return;
  }
  $('#upload-btn').disabled = false;
  await finalizeSession(session.id);
}

// ---------- Traitement : transcription puis résumé ----------

function enqueue(sessionId, task) {
  const previous = state.queues.get(sessionId) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  state.queues.set(sessionId, next);
  next.finally(() => {
    if (state.queues.get(sessionId) === next) state.queues.delete(sessionId);
  });
  return next;
}

function setLiveStatus(sessionId, message) {
  if (message) state.liveStatus.set(sessionId, message);
  else state.liveStatus.delete(sessionId);
  refreshSessionView(sessionId);
}

function waitMessage(sessionId) {
  return (seconds, err) => setLiveStatus(sessionId, `${err.message} Nouvelle tentative dans ${Math.ceil(seconds)} s…`);
}

function scheduleTranscription(sessionId) {
  return enqueue(sessionId, () => transcribePending(sessionId));
}

async function transcribePending(sessionId) {
  const chunks = await db.getChunks(sessionId);
  const todo = chunks.filter((c) => c.status === 'pending' || c.status === 'error');
  const total = chunks.filter((c) => c.status !== 'skipped').length;
  let done = chunks.filter((c) => c.status === 'done').length;

  for (const chunk of todo) {
    if (!chunk.blob) {
      chunk.status = 'error';
      chunk.error = 'Audio introuvable.';
      await db.putChunk(chunk);
      continue;
    }
    setLiveStatus(sessionId, `Transcription du segment ${done + 1}/${total}…`);
    try {
      const filename = `segment-${chunk.index}-${chunk.track}.${extensionFor(chunk.mime)}`;
      const result = await withRetry(() => transcribe(chunk.blob, filename, settings), {
        onWait: waitMessage(sessionId),
      });
      chunk.segments = cleanWhisperSegments(result, chunk.durationSec);
      chunk.status = 'done';
      chunk.error = '';
      done++;
    } catch (err) {
      chunk.status = 'error';
      chunk.error = err.message;
    }
    await db.putChunk(chunk);
    setLiveStatus(sessionId, '');
    // Clé refusée : inutile d'essayer les segments suivants.
    if (chunk.status === 'error' && (chunk.error.includes('Clé API') || !navigator.onLine)) break;
  }
}

function summaryMeta(session) {
  return {
    title: session.title,
    date: formatDate(session.createdAt),
    duration: formatClock(session.durationSec),
    speakers: session.labels?.me ? [session.labels.me, session.labels.them] : [],
  };
}

function extractTitle(summary) {
  const match = /^\s*#\s+(.+)\n?/.exec(summary);
  if (!match) return { title: null, body: summary.trim() };
  return { title: match[1].trim(), body: summary.slice(match[0].length).trim() };
}

async function summarize(sessionId) {
  const session = await db.getSession(sessionId);
  await db.patchSession(sessionId, { status: 'summarizing', error: '' });
  refreshSessionView(sessionId);
  try {
    const { text, provider } = await summarizeMeeting(transcriptToText(session.transcript), summaryMeta(session), settings, {
      onStatus: (message) => setLiveStatus(sessionId, message),
      onWait: waitMessage(sessionId),
    });
    const { title, body } = extractTitle(text);
    await db.patchSession(sessionId, (s) => {
      s.summary = body;
      s.summaryProvider = provider;
      s.status = 'done';
      s.error = '';
      if (title && s.titleIsDefault) s.title = title;
    });
  } catch (err) {
    await db.patchSession(sessionId, { status: 'error', error: `Résumé impossible : ${err.message}` });
  }
  setLiveStatus(sessionId, '');
}

function finalizeSession(sessionId) {
  setBusyGuard(true);
  return enqueue(sessionId, async () => {
    await db.patchSession(sessionId, { status: 'processing', error: '' });
    await transcribePending(sessionId);
    const chunks = await db.getChunks(sessionId);
    const failed = chunks.filter((c) => c.status !== 'done' && c.status !== 'skipped');
    const session = await db.patchSession(sessionId, (s) => {
      s.transcript = buildTranscript(chunks, s.labels);
      if (!s.durationSec) s.durationSec = Math.max(0, ...chunks.map((c) => c.startSec + c.durationSec));
      if (failed.length) {
        s.status = 'error';
        s.error = `${failed.length} segment(s) non transcrit(s) : ${failed[0].error || 'erreur inconnue'}`;
      } else if (!s.transcript.length) {
        s.status = 'done';
        s.error = "Aucune parole détectée dans l'enregistrement.";
      }
    });
    if (!failed.length) await dropAudio(chunks);
    if (session.status !== 'error' && session.transcript.length) await summarize(sessionId);
  }).finally(() => {
    if (!state.recorder && !state.queues.size) setBusyGuard(false);
    refreshSessionView(sessionId);
    refreshHistory();
  });
}

// L'audio ne sert qu'à la transcription : une fois tout transcrit, on le supprime.
async function dropAudio(chunks) {
  for (const chunk of chunks) {
    if (!chunk.blob) continue;
    chunk.blob = null;
    await db.putChunk(chunk);
  }
}

// Au chargement : une réunion restée "en cours" vient d'un onglet fermé ou planté.
async function recoverInterruptedSessions() {
  for (const session of await db.listSessions()) {
    if (['recording', 'processing', 'summarizing'].includes(session.status)) {
      await db.patchSession(session.id, {
        status: 'error',
        error:
          session.status === 'recording'
            ? "L'onglet a été fermé pendant l'enregistrement. Les segments déjà enregistrés peuvent être traités."
            : "Le traitement a été interrompu (onglet fermé). Clique sur « Reprendre le traitement ».",
      });
    }
  }
}

// ---------- Affichage d'une réunion ----------

async function openSession(sessionId) {
  state.currentId = sessionId;
  show($('#session-card'), true);
  await refreshSessionView(sessionId);
  refreshHistory();
}

let renderToken = 0;

async function refreshSessionView(sessionId) {
  if (sessionId !== state.currentId) return;
  const token = ++renderToken;
  const [session, chunks] = await Promise.all([db.getSession(sessionId), db.getChunks(sessionId)]);
  if (token !== renderToken || sessionId !== state.currentId) return;
  if (!session) {
    show($('#session-card'), false);
    state.currentId = null;
    return;
  }

  const titleInput = $('#session-title');
  if (document.activeElement !== titleInput) titleInput.value = session.title;

  const meta = [formatDate(session.createdAt), MODE_LABELS[session.mode]];
  if (session.durationSec) meta.push(formatClock(session.durationSec));
  if (session.summaryProvider) meta.push(`résumé : ${session.summaryProvider}`);
  $('#session-meta').textContent = meta.join(' · ');

  // Progression
  const counted = chunks.filter((c) => c.status !== 'skipped');
  const done = counted.filter((c) => c.status === 'done').length;
  const busy = ['recording', 'processing', 'summarizing'].includes(session.status);
  const live = state.liveStatus.get(sessionId);
  show($('#progress'), busy || Boolean(live));
  const ratio = session.status === 'summarizing' ? 1 : counted.length ? done / counted.length : 0;
  $('#progress .progress-bar i').style.width = `${Math.round(ratio * 100)}%`;
  let progressText = live || '';
  if (!progressText) {
    if (session.status === 'recording') {
      progressText = `Enregistrement en cours. ${done} segment(s) déjà transcrit(s), les suivants arrivent toutes les ${Math.round(SEGMENT_SECONDS / 60)} min.`;
    } else if (session.status === 'summarizing') {
      progressText = 'Rédaction du compte-rendu…';
    } else if (busy) {
      progressText = `Transcription : ${done}/${counted.length} segment(s).`;
    }
  }
  $('#progress-text').textContent = progressText;
  showError($('#session-error'), session.error);

  // Transcription (construite en direct pendant l'enregistrement)
  const transcript = session.transcript?.length ? session.transcript : buildTranscript(chunks, session.labels);
  renderTranscript(transcript, session.labels);

  // Résumé
  const summaryEl = $('#summary');
  if (session.summary) {
    summaryEl.innerHTML = renderMarkdown(session.summary);
  } else {
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder';
    placeholder.textContent =
      session.status === 'recording'
        ? "Le compte-rendu sera généré à l'arrêt de l'enregistrement."
        : busy
          ? 'En préparation…'
          : 'Pas de compte-rendu.';
    summaryEl.replaceChildren(placeholder);
  }

  // Actions
  const queued = state.queues.has(sessionId);
  const recordingThis = state.recorder && state.recordingId === sessionId;
  const hasAudioLeft = chunks.some((c) => (c.status === 'pending' || c.status === 'error') && c.blob);
  show($('#resume-btn'), !queued && !recordingThis && session.status === 'error' && (hasAudioLeft || session.transcript?.length > 0 || done > 0));
  show($('#resummarize-btn'), !queued && !busy && session.transcript?.length > 0 && !hasAudioLeft);
  show($('#copy-summary-btn'), Boolean(session.summary));
  show($('#copy-transcript-btn'), transcript.length > 0);
  show($('#export-btn'), Boolean(session.summary) || transcript.length > 0);
}

function renderTranscript(utterances, labels = {}) {
  const container = $('#transcript');
  if (!utterances.length) {
    const empty = document.createElement('p');
    empty.className = 'muted small';
    empty.textContent = 'La transcription apparaîtra ici.';
    container.replaceChildren(empty);
    return;
  }
  const trackOf = Object.fromEntries(Object.entries(labels).map(([track, label]) => [label, track]));
  const nodes = utterances.map((u) => {
    const row = document.createElement('div');
    row.className = 'utt';
    if (trackOf[u.speaker]) row.dataset.track = trackOf[u.speaker];
    const time = document.createElement('time');
    time.textContent = formatClock(u.t);
    const p = document.createElement('p');
    if (u.speaker) {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = u.speaker;
      p.append(who);
    }
    p.append(document.createTextNode(u.text));
    row.append(time, p);
    return row;
  });
  const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
  container.replaceChildren(...nodes);
  if (atBottom && state.recorder) container.scrollTop = container.scrollHeight;
}

async function currentExport() {
  const session = await db.getSession(state.currentId);
  const transcript = transcriptToText(session.transcript || []);
  const header = `# ${session.title}\n\n${formatDate(session.createdAt)} · ${formatClock(session.durationSec)}\n`;
  return { session, transcript, markdown: `${header}\n${session.summary || ''}\n\n## Transcription\n\n${transcript}\n` };
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = 'Copié ✓';
    setTimeout(() => (button.textContent = label), 1500);
  } catch {
    alert("Copie impossible : le navigateur l'a refusée.");
  }
}

// ---------- Historique ----------

const STATUS_BADGES = {
  recording: ['En cours', 'warn'],
  processing: ['Transcription…', 'warn'],
  summarizing: ['Résumé…', 'warn'],
  done: ['Prêt', 'ok'],
  error: ['À reprendre', 'err'],
};

async function refreshHistory() {
  const sessions = await db.listSessions();
  const list = $('#history-list');
  show($('#history-empty'), sessions.length === 0);
  list.replaceChildren(
    ...sessions.map((session) => {
      const li = document.createElement('li');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'open';
      if (session.id === state.currentId) open.setAttribute('aria-current', 'true');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = session.title;
      const [label, tone] = STATUS_BADGES[session.status] || ['', ''];
      const info = document.createElement('span');
      info.className = `badge ${tone}`;
      const parts = [formatDate(session.createdAt), MODE_LABELS[session.mode]];
      if (session.durationSec) parts.push(formatClock(session.durationSec));
      info.textContent = `${parts.join(' · ')} · ${label}`;
      open.append(name, info);
      open.addEventListener('click', () => openSession(session.id));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ghost';
      remove.textContent = 'Supprimer';
      remove.setAttribute('aria-label', `Supprimer « ${session.title} »`);
      remove.disabled = state.recordingId === session.id && Boolean(state.recorder);
      remove.addEventListener('click', async () => {
        if (state.queues.has(session.id)) {
          alert('Traitement en cours : attends la fin avant de supprimer.');
          return;
        }
        if (!confirm(`Supprimer définitivement « ${session.title} » ?`)) return;
        await db.deleteSession(session.id);
        if (state.currentId === session.id) {
          state.currentId = null;
          show($('#session-card'), false);
        }
        refreshHistory();
      });
      li.append(open, remove);
      return li;
    }),
  );
}

// ---------- Réglages ----------

const SETTING_FIELDS = {
  groqKey: '#groq-key',
  geminiKey: '#gemini-key',
  language: '#language',
  vocabulary: '#vocabulary',
  meLabel: '#me-label',
  themLabel: '#them-label',
  summaryProvider: '#summary-provider',
  summaryLanguage: '#summary-language',
  whisperModel: '#whisper-model',
  groqChatModel: '#groq-chat-model',
  geminiModel: '#gemini-model',
};

function openSettings(notice = '') {
  for (const [key, selector] of Object.entries(SETTING_FIELDS)) $(selector).value = settings[key];
  $('#settings-notice').textContent = notice;
  show($('#settings-notice'), Boolean(notice));
  $('#settings-status').textContent = '';
  $('#settings-dialog').showModal();
}

function readSettingsForm() {
  const next = { ...settings };
  for (const [key, selector] of Object.entries(SETTING_FIELDS)) next[key] = $(selector).value.trim();
  for (const key of ['whisperModel', 'groqChatModel', 'geminiModel', 'meLabel', 'themLabel']) {
    next[key] ||= DEFAULT_SETTINGS[key];
  }
  return next;
}

function fillDatalist(selector, values) {
  $(selector).replaceChildren(...values.map((v) => Object.assign(document.createElement('option'), { value: v })));
}

function pickAvailable(current, available, preferred) {
  if (available.includes(current)) return current;
  return preferred.find((m) => available.includes(m)) || current;
}

async function testKeys() {
  const status = $('#settings-status');
  const form = readSettingsForm();
  const lines = [];
  $('#test-keys-btn').disabled = true;
  status.textContent = 'Vérification…';

  if (!form.groqKey) {
    lines.push('Groq : clé manquante (obligatoire).');
  } else {
    try {
      const models = await listGroqModels(form.groqKey);
      fillDatalist('#groq-models', models);
      const whisper = pickAvailable(form.whisperModel, models, PREFERRED_WHISPER);
      const chat = pickAvailable(form.groqChatModel, models, PREFERRED_GROQ_CHAT);
      $('#whisper-model').value = whisper;
      $('#groq-chat-model').value = chat;
      const missing = [whisper, chat].filter((m) => !models.includes(m));
      lines.push(missing.length ? `Groq : clé valide, mais modèle introuvable : ${missing.join(', ')}.` : `Groq : OK (${whisper}, ${chat}).`);
    } catch (err) {
      lines.push(`Groq : ${err.message}`);
    }
  }

  if (form.geminiKey) {
    try {
      const models = await listGeminiModels(form.geminiKey);
      fillDatalist('#gemini-models', models);
      const fallback = models.filter((m) => /flash/.test(m) && !/lite|image|tts|live|audio/.test(m)).at(-1);
      const model = models.includes(form.geminiModel) ? form.geminiModel : fallback || form.geminiModel;
      $('#gemini-model').value = model;
      lines.push(models.includes(model) ? `Gemini : OK (${model}).` : `Gemini : clé valide, mais modèle « ${model} » introuvable.`);
    } catch (err) {
      lines.push(`Gemini : ${err.message}`);
    }
  } else if (form.summaryProvider === 'gemini') {
    lines.push('Gemini choisi pour le résumé mais aucune clé : Groq sera utilisé.');
  }

  status.textContent = lines.join(' ');
  $('#test-keys-btn').disabled = false;
}

// ---------- Démarrage ----------

function bindEvents() {
  for (const tab of document.querySelectorAll('.tabs [data-mode]')) {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  }
  $('#start-btn').addEventListener('click', startRecording);
  $('#stop-btn').addEventListener('click', stopRecording);
  $('#upload-btn').addEventListener('click', transcribeFile);

  $('#settings-btn').addEventListener('click', () => openSettings());
  $('#settings-cancel').addEventListener('click', () => $('#settings-dialog').close());
  $('#settings-save').addEventListener('click', () => {
    saveSettings(readSettingsForm());
    $('#settings-dialog').close();
  });
  $('#test-keys-btn').addEventListener('click', testKeys);

  $('#session-title').addEventListener('change', async (e) => {
    const title = e.target.value.trim();
    if (!title || !state.currentId) return;
    await db.patchSession(state.currentId, { title, titleIsDefault: false });
    refreshHistory();
  });

  $('#resume-btn').addEventListener('click', async () => {
    const id = state.currentId;
    // Les segments en erreur repassent en attente pour être retentés.
    for (const chunk of await db.getChunks(id)) {
      if (chunk.status === 'error' && chunk.blob) await db.putChunk({ ...chunk, status: 'pending', error: '' });
    }
    finalizeSession(id);
    refreshSessionView(id);
  });

  $('#resummarize-btn').addEventListener('click', () => {
    const id = state.currentId;
    setBusyGuard(true);
    enqueue(id, () => summarize(id)).finally(() => {
      if (!state.recorder && !state.queues.size) setBusyGuard(false);
      refreshSessionView(id);
      refreshHistory();
    });
    refreshSessionView(id);
  });

  $('#copy-summary-btn').addEventListener('click', async (e) => {
    const { session } = await currentExport();
    copyText(`# ${session.title}\n\n${session.summary}`, e.currentTarget);
  });
  $('#copy-transcript-btn').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    const session = await db.getSession(state.currentId);
    const utterances = session.transcript?.length
      ? session.transcript
      : buildTranscript(await db.getChunks(state.currentId), session.labels);
    copyText(transcriptToText(utterances), button);
  });
  $('#export-btn').addEventListener('click', async () => {
    const { session, markdown } = await currentExport();
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: `${session.title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)}.md`,
    });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

async function init() {
  bindEvents();
  applyLabels();
  setMode('pc');
  try {
    await recoverInterruptedSessions();
    const [latest] = await db.listSessions();
    if (latest) await openSession(latest.id);
    else refreshHistory();
  } catch (err) {
    showError($('#record-error'), `Stockage local indisponible (${err.message}). L'historique ne sera pas conservé.`);
  }
  if (!settings.groqKey) openSettings('Bienvenue ! Colle ta clé Groq gratuite pour commencer (2 minutes, sans carte bancaire).');
}

init();
