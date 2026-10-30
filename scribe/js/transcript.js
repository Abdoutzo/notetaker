// Nettoyage des segments Whisper, fusion des pistes "Moi" / "Interlocuteur"
// en une transcription chronologique, et rendu Markdown minimal.

// Phrases que Whisper invente classiquement sur du silence (surtout en français).
const HALLUCINATIONS = [
  /amara\.org/i,
  /sous-titr(es|age)\s+(réalisés?|fait|faits|par)/i,
  /merci d'avoir regardé/i,
  /n'oubliez pas de (vous abonner|liker)/i,
  /abonnez-vous/i,
  /thanks? (you )?for watching/i,
  /^[\s.,!?…\-–]*$/,
];

function isUsable(seg) {
  const text = (seg.text || '').trim();
  if (!text) return false;
  if (HALLUCINATIONS.some((re) => re.test(text))) return false;
  if (seg.no_speech_prob > 0.85) return false;
  if (seg.no_speech_prob > 0.5 && seg.avg_logprob < -1) return false;
  if (seg.compression_ratio > 2.8) return false; // boucle de répétition
  return true;
}

// Réponse "verbose_json" de l'API -> [{ start, end, text }] (secondes relatives au segment)
export function cleanWhisperSegments(result, durationSec) {
  if (Array.isArray(result?.segments) && result.segments.length) {
    return result.segments
      .filter(isUsable)
      .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
  }
  const text = (result?.text || '').trim();
  return text && isUsable({ text }) ? [{ start: 0, end: durationSec, text }] : [];
}

function words(text) {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
}

function overlapRatio(a, b) {
  if (a.size < 3 || b.size < 3) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / Math.min(a.size, b.size);
}

// Sans casque, le micro capte aussi la voix de l'interlocuteur sortant des
// haut-parleurs : on supprime ces "échos" côté "Moi" quand ils doublonnent
// un passage de l'autre piste au même moment.
function removeEchoes(items) {
  const them = items.filter((i) => i.track === 'them').map((i) => ({ ...i, words: words(i.text) }));
  if (!them.length) return items;
  return items.filter((item) => {
    if (item.track !== 'me') return true;
    const mine = words(item.text);
    return !them.some((o) => o.t <= item.end + 1.5 && o.end >= item.t - 1.5 && overlapRatio(mine, o.words) >= 0.6);
  });
}

// chunks : segments stockés en base ; labels : { me, them, mix }
export function buildTranscript(chunks, labels = {}) {
  const items = [];
  for (const chunk of chunks) {
    if (chunk.status !== 'done') continue;
    for (const seg of chunk.segments) {
      items.push({
        t: chunk.startSec + seg.start,
        end: chunk.startSec + seg.end,
        track: chunk.track,
        text: seg.text,
      });
    }
  }
  items.sort((a, b) => a.t - b.t);

  const utterances = [];
  for (const item of removeEchoes(items)) {
    const last = utterances.at(-1);
    if (last && last.track === item.track && item.t - last.end < 2.5 && last.text.length < 600) {
      last.text += ` ${item.text}`;
      last.end = item.end;
    } else {
      utterances.push({ ...item });
    }
  }
  return utterances.map((u) => ({ t: u.t, speaker: labels[u.track] || '', text: u.text }));
}

export function formatClock(totalSec) {
  const sec = Math.max(0, Math.round(totalSec || 0));
  const h = Math.floor(sec / 3600);
  const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function transcriptToText(utterances) {
  return utterances
    .map((u) => `[${formatClock(u.t)}] ${u.speaker ? `${u.speaker} : ` : ''}${u.text}`)
    .join('\n');
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Markdown -> HTML (titres, listes, cases à cocher, gras). Tout le texte est
// échappé avant d'insérer nos propres balises.
export function renderMarkdown(md) {
  const html = [];
  let list = null;
  const closeList = () => {
    if (list) html.push(`</${list.tag}>`);
    list = null;
  };
  const openList = (tag, className = '') => {
    if (list?.tag === tag && list.className === className) return;
    closeList();
    html.push(className ? `<${tag} class="${className}">` : `<${tag}>`);
    list = { tag, className };
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    let m;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) {
      closeList();
      const level = Math.min(4, m[1].length + 1);
      html.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if ((m = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line))) {
      openList('ul', 'tasks');
      const checked = m[1].trim() ? ' checked' : '';
      html.push(`<li><input type="checkbox" disabled${checked}> ${inline(m[2])}</li>`);
    } else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) {
      openList('ul');
      html.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      openList('ol');
      html.push(`<li>${inline(m[1])}</li>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return html.join('\n');
}
