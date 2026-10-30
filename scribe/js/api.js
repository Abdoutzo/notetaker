// Appels directs aux APIs depuis le navigateur (les deux autorisent le CORS) :
// - Groq : transcription Whisper (gratuit) + LLM de secours pour le résumé
// - Gemini : résumé en un seul appel grâce à sa grande fenêtre de contexte

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Le palier gratuit de Groq limite les tokens par minute (~6 à 12k selon le
// modèle) : au-delà de cette taille, on résume par morceaux puis on fusionne.
const GROQ_DIRECT_LIMIT = 14000;
const GROQ_PART_SIZE = 11000;

export class ApiError extends Error {
  constructor(message, { status = 0, retryAfter = null, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.retryable = retryable;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// "Please try again in 1m26.4s" (Groq), "Please retry in 34.5s" (Gemini)
function parseRetryAfter(message, body) {
  const delay = body?.error?.details?.find?.((d) => d.retryDelay)?.retryDelay;
  if (delay) return parseFloat(delay);
  const m = /(?:try again|retry) in\s+(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)(ms|s))?/i.exec(message || '');
  if (!m || !(m[1] || m[2] || m[3])) return null;
  const seconds = m[3] ? (m[4].toLowerCase() === 'ms' ? m[3] / 1000 : +m[3]) : 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + seconds;
}

function describe(provider, status, message) {
  if (status === 401 || status === 403) return `Clé API ${provider} refusée. Vérifie-la dans les réglages.`;
  if (status === 413) return `Fichier trop volumineux pour ${provider}.`;
  if (status === 429) return `Quota gratuit ${provider} atteint pour le moment.`;
  return `${provider} : ${message}`;
}

async function request(provider, url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(`Impossible de joindre ${provider} (connexion internet ?).`, { retryable: true });
  }
  if (res.ok) return res.json();
  const text = await res.text().catch(() => '');
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // réponse non JSON
  }
  const message = body?.error?.message || text || res.statusText;
  throw new ApiError(describe(provider, res.status, message), {
    status: res.status,
    retryAfter: parseRetryAfter(message, body),
    retryable: res.status === 429 || res.status >= 500,
  });
}

export async function withRetry(fn, { onWait, maxAttempts = 6, maxWaitSec = 900 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof ApiError) || !err.retryable || attempt >= maxAttempts) throw err;
      const wait = Math.min(maxWaitSec, err.retryAfter != null ? err.retryAfter + 1 : 5 * 2 ** (attempt - 1));
      onWait?.(wait, err);
      await sleep(wait * 1000);
    }
  }
}

// ---------- Transcription ----------

export function transcribe(blob, filename, settings) {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', settings.whisperModel);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  if (settings.language && settings.language !== 'auto') form.append('language', settings.language);
  // Le "prompt" Whisper aide à bien orthographier noms propres et jargon.
  const vocabulary = settings.vocabulary.trim();
  if (vocabulary) form.append('prompt', vocabulary.slice(0, 800));
  return request('Groq', `${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.groqKey}` },
    body: form,
  });
}

// ---------- Modèles disponibles (test des clés) ----------

export async function listGroqModels(apiKey) {
  const data = await request('Groq', `${GROQ_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return (data.data || []).filter((m) => m.active !== false).map((m) => m.id).sort();
}

export async function listGeminiModels(apiKey) {
  const data = await request('Gemini', `${GEMINI_BASE}/models?pageSize=1000`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  return (data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .sort();
}

// ---------- Résumé ----------

async function groqChat(settings, system, user, maxTokens) {
  const data = await request('Groq', `${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.groqKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.groqChatModel,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new ApiError('Groq a renvoyé une réponse vide.');
  return text;
}

async function geminiGenerate(settings, system, user) {
  const model = settings.geminiModel.replace(/^models\//, '');
  const data = await request('Gemini', `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': settings.geminiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) {
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason || 'raison inconnue';
    throw new ApiError(`Gemini n'a renvoyé aucun texte (${reason}).`);
  }
  return text;
}

function speakersNote(meta) {
  if (meta.speakers?.length) {
    return `Les interventions sont étiquetées : « ${meta.speakers[0]} » = la personne qui a enregistré et pour qui tu rédiges, « ${meta.speakers[1]} » = la ou les autres personnes de l'appel.`;
  }
  return "Les interventions ne sont pas attribuées à un locuteur : déduis qui parle uniquement quand c'est évident, sans inventer de noms.";
}

function summarySystemPrompt(settings, meta) {
  return `Tu es un assistant expert en comptes-rendus de réunion. À partir d'une transcription automatique (qui peut contenir des erreurs de reconnaissance), tu rédiges un compte-rendu fidèle, clair et actionnable, en ${settings.summaryLanguage}.

Règles :
- N'invente rien : uniquement ce qui est dit. Si un responsable ou une échéance n'est pas mentionné, écris « non précisé ».
- Corrige silencieusement les erreurs évidentes de transcription (noms, termes techniques).
- ${speakersNote(meta)}
- Sois concis : des puces courtes, pas de remplissage, pas de phrase d'introduction.
- Conserve les chiffres, dates, montants et noms cités.

Format de sortie : Markdown, exactement ces sections (traduis les titres si la langue demandée n'est pas le français) :
# <titre court et explicite de la réunion>
## Résumé
<3 à 6 phrases>
## Points clés
- ...
## Décisions
- ... (ou « Aucune décision explicite. »)
## Actions à mener
- [ ] **<responsable>** : <action> (échéance : <date ou « non précisée »>)
## Questions ouvertes
- ...
## Prochaines étapes
- ...`;
}

function notesSystemPrompt(settings, meta) {
  return `Tu prends des notes détaillées sur un extrait de transcription de réunion, en ${settings.summaryLanguage}. ${speakersNote(meta)}
Liste en puces courtes : sujets abordés, faits et chiffres, décisions, actions (avec responsable et échéance si dites), questions restées ouvertes. N'invente rien. Maximum 250 mots.`;
}

function header(meta) {
  return `Réunion : ${meta.title}\nDate : ${meta.date}\nDurée : ${meta.duration}`;
}

function splitText(text, size) {
  const parts = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current && current.length + line.length + 1 > size) {
      parts.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + line;
  }
  if (current) parts.push(current);
  return parts;
}

async function summarizeWithGroq(transcript, meta, settings, onStatus, onWait) {
  let material = transcript;
  let isNotes = false;
  // Map-reduce : on condense par morceaux jusqu'à tenir dans un seul appel.
  for (let round = 0; material.length > GROQ_DIRECT_LIMIT && round < 3; round++) {
    const parts = splitText(material, GROQ_PART_SIZE);
    const notes = [];
    for (let i = 0; i < parts.length; i++) {
      onStatus?.(`Résumé (Groq) : lecture de la partie ${i + 1}/${parts.length}…`);
      const note = await withRetry(() => groqChat(settings, notesSystemPrompt(settings, meta), parts[i], 900), { onWait });
      notes.push(`### Partie ${i + 1}/${parts.length}\n${note}`);
    }
    material = notes.join('\n\n');
    isNotes = true;
  }
  onStatus?.('Résumé (Groq) : rédaction du compte-rendu…');
  const intro = isNotes
    ? 'Voici les notes prises successivement sur toute la réunion (dans l\'ordre chronologique) :'
    : 'Voici la transcription horodatée :';
  const user = `${header(meta)}\n\n${intro}\n\n${material}`;
  return withRetry(() => groqChat(settings, summarySystemPrompt(settings, meta), user, 2500), { onWait });
}

// meta : { title, date, duration, speakers: [moi, interlocuteur] | [] }
export async function summarizeMeeting(transcript, meta, settings, { onStatus, onWait } = {}) {
  if (settings.summaryProvider === 'gemini' && settings.geminiKey) {
    try {
      onStatus?.('Résumé avec Gemini…');
      const user = `${header(meta)}\n\nVoici la transcription horodatée :\n\n${transcript}`;
      const text = await withRetry(() => geminiGenerate(settings, summarySystemPrompt(settings, meta), user), {
        onWait,
        maxAttempts: 3,
        maxWaitSec: 120,
      });
      return { provider: 'Gemini', text };
    } catch (err) {
      if (!settings.groqKey) throw err;
      onStatus?.(`${err.message} Bascule sur Groq…`);
    }
  }
  const text = await summarizeWithGroq(transcript, meta, settings, onStatus, onWait);
  return { provider: 'Groq', text };
}
