import { LoopPoint } from '../types';

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export const exportWavWithSmpl = (buffer: AudioBuffer, loopPoint: LoopPoint | null): Blob => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  // Interleave data
  const length = buffer.length * numChannels * 2; // 2 bytes per sample
  const data = new Int16Array(buffer.length * numChannels);
  
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      // Clamp and scale to 16-bit
      const s = Math.max(-1, Math.min(1, sample));
      data[i * numChannels + channel] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
  }

  // Calculate chunks sizes
  const dataChunkSize = length;
  const fmtChunkSize = 16;
  // SMPL chunk: 36 bytes header + 1 loop (24 bytes) = 60 bytes
  // Or 36 bytes if no loops
  const smplChunkSize = loopPoint ? 36 + 24 : 0; 
  
  // RIFF chunk size = 4 + (8+fmt) + (8+data) + (8+smpl if exists)
  const fileSize = 4 + (8 + fmtChunkSize) + (8 + dataChunkSize) + (loopPoint ? (8 + smplChunkSize) : 0);

  const arrayBuffer = new ArrayBuffer(fileSize + 8);
  const view = new DataView(arrayBuffer);

  let pos = 0;

  // RIFF header
  writeString(view, pos, 'RIFF'); pos += 4;
  view.setUint32(pos, fileSize, true); pos += 4;
  writeString(view, pos, 'WAVE'); pos += 4;

  // fmt chunk
  writeString(view, pos, 'fmt '); pos += 4;
  view.setUint32(pos, fmtChunkSize, true); pos += 4;
  view.setUint16(pos, format, true); pos += 2;
  view.setUint16(pos, numChannels, true); pos += 2;
  view.setUint32(pos, sampleRate, true); pos += 4;
  view.setUint32(pos, sampleRate * numChannels * 2, true); pos += 4; // byte rate
  view.setUint16(pos, numChannels * 2, true); pos += 2; // block align
  view.setUint16(pos, bitDepth, true); pos += 2;

  // data chunk
  writeString(view, pos, 'data'); pos += 4;
  view.setUint32(pos, dataChunkSize, true); pos += 4;
  
  // Write PCM data
  const pcmData = new Uint8Array(data.buffer);
  const targetArray = new Uint8Array(arrayBuffer);
  targetArray.set(pcmData, pos);
  pos += dataChunkSize;

  // smpl chunk
  if (loopPoint) {
      writeString(view, pos, 'smpl'); pos += 4;
      view.setUint32(pos, smplChunkSize, true); pos += 4;

      view.setUint32(pos, 0, true); pos += 4; // Manufacturer
      view.setUint32(pos, 0, true); pos += 4; // Product
      view.setUint32(pos, 1000000000 / sampleRate, true); pos += 4; // Sample Period (nanoseconds)
      view.setUint32(pos, 60, true); pos += 4; // MIDI Unity Note (C5)
      view.setUint32(pos, 0, true); pos += 4; // MIDI Pitch Fraction
      view.setUint32(pos, 0, true); pos += 4; // SMPTE Format
      view.setUint32(pos, 0, true); pos += 4; // SMPTE Offset
      view.setUint32(pos, 1, true); pos += 4; // Num Sample Loops
      view.setUint32(pos, 0, true); pos += 4; // Sampler Data

      // Loop 1
      view.setUint32(pos, 0, true); pos += 4; // Cue Point ID
      view.setUint32(pos, 0, true); pos += 4; // Type (0=Forward)
      view.setUint32(pos, loopPoint.start, true); pos += 4; // Start
      view.setUint32(pos, loopPoint.end, true); pos += 4; // End
      view.setUint32(pos, 0, true); pos += 4; // Fraction
      view.setUint32(pos, 0, true); pos += 4; // Play Count (0 = infinite)
  }

  return new Blob([view], { type: 'audio/wav' });
};
