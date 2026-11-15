/**
 * Procedural Audio Sound Effects Generator
 * Produces clean 16-bit PCM WAV Data URIs for instant playback & timeline editing.
 */

function encodeWav(samples: Float32Array, sampleRate = 44100): string {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF chunk
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + numSamples * 2, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, numSamples * 2, true);

  // Write 16-bit samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  // Convert buffer to base64
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

export type SfxType = 'whoosh' | 'pop' | 'click' | 'chime' | 'shutter';

export function generateSfx(type: SfxType, sampleRate = 44100): { url: string; durationSec: number } {
  let dur = 0.5;
  if (type === 'whoosh') dur = 0.6;
  if (type === 'pop') dur = 0.15;
  if (type === 'click') dur = 0.05;
  if (type === 'chime') dur = 1.0;
  if (type === 'shutter') dur = 0.25;

  const numSamples = Math.round(dur * sampleRate);
  const data = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    if (type === 'whoosh') {
      const p = t / dur;
      const env = Math.sin(p * Math.PI);
      const noise = Math.random() * 2 - 1;
      const freq = 200 + 800 * Math.sin(p * Math.PI);
      data[i] = (noise * 0.4 + Math.sin(2 * Math.PI * freq * t) * 0.4) * env;
    } else if (type === 'pop') {
      const p = t / dur;
      const env = Math.exp(-p * 15);
      const freq = 800 * Math.exp(-p * 8);
      data[i] = Math.sin(2 * Math.PI * freq * t) * env;
    } else if (type === 'click') {
      const p = t / dur;
      const env = Math.exp(-p * 40);
      data[i] = Math.sin(2 * Math.PI * 1800 * t) * env;
    } else if (type === 'chime') {
      const p = t / dur;
      const env = Math.exp(-p * 3.5);
      const t1 = Math.sin(2 * Math.PI * 587.33 * t); // D5
      const t2 = Math.sin(2 * Math.PI * 880.00 * t); // A5
      const t3 = Math.sin(2 * Math.PI * 1174.66 * t); // D6
      data[i] = (t1 * 0.4 + t2 * 0.35 + t3 * 0.25) * env;
    } else if (type === 'shutter') {
      const p1 = t;
      const p2 = t - 0.08;
      let val = 0;
      if (p1 >= 0 && p1 < 0.04) {
        val += (Math.random() * 2 - 1) * Math.exp(-p1 * 60);
      }
      if (p2 >= 0 && p2 < 0.06) {
        val += (Math.random() * 2 - 1) * Math.exp(-p2 * 45);
      }
      data[i] = val;
    }
  }

  return {
    url: encodeWav(data, sampleRate),
    durationSec: dur,
  };
}
