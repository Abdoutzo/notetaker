// Import d'un fichier audio existant (ex. enregistrement d'appel du téléphone).
// Le fichier est décodé, converti en mono 16 kHz puis découpé en WAV de 10 min
// (≈ 19 Mo chacun, sous la limite de 25 Mo de Groq).

const SAMPLE_RATE = 16000;

export async function splitAudioFile(file, segmentSeconds = 600) {
  const data = await file.arrayBuffer();
  // decodeAudioData rééchantillonne directement à la fréquence du contexte.
  const audio = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(data);
  const mono = toMono(audio);
  const rate = audio.sampleRate;
  const perSegment = segmentSeconds * rate;
  const pieces = [];
  for (let start = 0, index = 0; start < mono.length; start += perSegment, index++) {
    const slice = mono.subarray(start, Math.min(mono.length, start + perSegment));
    if (slice.length < rate) continue; // moins d'une seconde : inutile
    pieces.push({
      index,
      startSec: start / rate,
      durationSec: slice.length / rate,
      blob: encodeWav(slice, rate),
    });
  }
  return { durationSec: mono.length / rate, pieces };
}

function toMono(audio) {
  if (audio.numberOfChannels === 1) return audio.getChannelData(0);
  const mono = new Float32Array(audio.length);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const channel = audio.getChannelData(ch);
    for (let i = 0; i < channel.length; i++) mono[i] += channel[i] / audio.numberOfChannels;
  }
  return mono;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // taille du bloc fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // octets par seconde
  view.setUint16(32, 2, true); // octets par échantillon
  view.setUint16(34, 16, true); // bits par échantillon
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0, offset = 44; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
