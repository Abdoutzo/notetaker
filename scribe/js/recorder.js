// Enregistrement segmenté : chaque piste (micro, son du PC) est découpée en
// fichiers audio autonomes (un MediaRecorder par segment). Ça permet de
// transcrire pendant la réunion et de rester sous la limite de 25 Mo de l'API.

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm',
];

// ~32 kbit/s en Opus : 5 min ≈ 1,2 Mo, largement suffisant pour de la voix.
const AUDIO_BITRATE = 32000;
// Niveau RMS au-dessus duquel on considère qu'il y a du son sur la piste.
const VOICE_RMS = 0.01;
// Nombre minimal de mesures avant d'oser déclarer un segment "silencieux".
// Onglet en arrière-plan = mesures plus rares : dans le doute, on transcrit.
const MIN_LEVEL_SAMPLES = 20;

export function pickMimeType() {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export function extensionFor(mime = '') {
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'mp4';
  return 'webm';
}

export class MeetingRecorder {
  // tracks : [{ id: 'me' | 'them' | 'mix', stream: MediaStream }]
  constructor({ tracks, segmentSeconds, onSegment, onTick, onEnded }) {
    this.tracks = tracks.map((t) => ({ ...t }));
    this.segmentSeconds = segmentSeconds;
    this.onSegment = onSegment;
    this.onTick = onTick;
    this.onEnded = onEnded;
    this.pending = [];
    this.index = 0;
  }

  async start() {
    this.mimeType = pickMimeType();
    this.ctx = new AudioContext();
    await this.ctx.resume();
    for (const track of this.tracks) {
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 2048;
      this.ctx.createMediaStreamSource(track.stream).connect(analyser);
      track.analyser = analyser;
      track.buffer = new Float32Array(analyser.fftSize);
      track.level = 0;
      for (const t of track.stream.getAudioTracks()) {
        t.addEventListener('ended', () => this.onEnded?.());
      }
    }
    this.t0 = performance.now();
    this.rotate();
    this.timer = setInterval(() => this.tick(), 250);
  }

  elapsed() {
    return (performance.now() - this.t0) / 1000;
  }

  tick() {
    for (const track of this.tracks) {
      track.analyser.getFloatTimeDomainData(track.buffer);
      let sum = 0;
      for (const v of track.buffer) sum += v * v;
      track.level = Math.sqrt(sum / track.buffer.length);
      const seg = track.current;
      if (seg) {
        seg.samples += 1;
        if (track.level > VOICE_RMS) seg.voiced += 1;
      }
    }
    const elapsed = this.elapsed();
    if (elapsed >= this.nextRotation) this.rotate();
    this.onTick?.({
      elapsed,
      levels: Object.fromEntries(this.tracks.map((t) => [t.id, t.level])),
    });
  }

  rotate() {
    const startSec = this.elapsed();
    const index = this.index++;
    for (const track of this.tracks) {
      const previous = track.current;
      // Le nouveau segment démarre avant l'arrêt du précédent : pas de trou.
      track.current = this.startSegment(track, index, startSec);
      if (previous) this.pending.push(this.finishSegment(track, previous, startSec));
    }
    this.nextRotation = startSec + this.segmentSeconds;
  }

  startSegment(track, index, startSec) {
    const options = { audioBitsPerSecond: AUDIO_BITRATE };
    if (this.mimeType) options.mimeType = this.mimeType;
    const rec = new MediaRecorder(track.stream, options);
    const parts = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) parts.push(e.data);
    };
    const done = new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(parts, { type: rec.mimeType || this.mimeType || 'audio/webm' }));
    });
    rec.start();
    return { rec, done, index, startSec, samples: 0, voiced: 0 };
  }

  async finishSegment(track, seg, endSec) {
    if (seg.rec.state !== 'inactive') seg.rec.stop();
    const blob = await seg.done;
    try {
      await this.onSegment({
        track: track.id,
        index: seg.index,
        startSec: seg.startSec,
        durationSec: endSec - seg.startSec,
        blob,
        voiced: seg.samples >= MIN_LEVEL_SAMPLES ? seg.voiced > 0 : null,
      });
    } catch (err) {
      console.error('Segment non sauvegardé', err);
    }
  }

  // Termine le segment en cours et attend que tous les segments soient remis.
  async stop() {
    clearInterval(this.timer);
    const endSec = this.elapsed();
    for (const track of this.tracks) {
      if (track.current) this.pending.push(this.finishSegment(track, track.current, endSec));
      track.current = null;
    }
    await Promise.all(this.pending);
    await this.ctx.close().catch(() => {});
    return endSec;
  }
}
