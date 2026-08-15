const fs = require('fs');

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

const sampleRate = 44100;
const duration = 2.0; // seconds
const numChannels = 1;
const bitsPerSample = 16;
const numSamples = sampleRate * duration;
const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
const blockAlign = numChannels * (bitsPerSample / 8);
const dataSize = numSamples * blockAlign;

const buffer = new ArrayBuffer(44 + dataSize);
const view = new DataView(buffer);

// RIFF chunk descriptor
writeString(view, 0, 'RIFF');
view.setUint32(4, 36 + dataSize, true);
writeString(view, 8, 'WAVE');

// fmt sub-chunk
writeString(view, 12, 'fmt ');
view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
view.setUint16(22, numChannels, true);
view.setUint32(24, sampleRate, true);
view.setUint32(28, byteRate, true);
view.setUint16(32, blockAlign, true);
view.setUint16(34, bitsPerSample, true);

// data sub-chunk
writeString(view, 36, 'data');
view.setUint32(40, dataSize, true);

// Write audio data (two-tone siren: 800Hz and 1000Hz)
let offset = 44;
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  // switch every 0.25 seconds
  const freq = (t % 0.5 < 0.25) ? 1000 : 800;
  // simple square wave
  const sample = Math.sin(2 * Math.PI * freq * t) > 0 ? 10000 : -10000;
  view.setInt16(offset, sample, true);
  offset += 2;
}

fs.mkdirSync('./assets', { recursive: true });
fs.writeFileSync('./assets/alarm.wav', Buffer.from(buffer));
console.log('Alarm generated at ./assets/alarm.wav');
