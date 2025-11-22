import { LoopPoint } from '../types';

// Helper to find zero crossing closest to a target sample
const findZeroCrossing = (data: Float32Array, target: number, windowSize: number): number => {
  let bestIndex = target;
  let minVal = 1.0;

  const start = Math.max(0, target - windowSize);
  const end = Math.min(data.length - 1, target + windowSize);

  for (let i = start; i < end; i++) {
    // Check for crossing from negative to positive or vice versa
    if ((data[i] <= 0 && data[i + 1] > 0) || (data[i] >= 0 && data[i + 1] < 0)) {
        // Calculate exact crossing point logic or just take the one closest to zero
        const dist = Math.abs(data[i]);
        if (dist < minVal) {
            minVal = dist;
            bestIndex = i;
        }
    }
  }
  return bestIndex;
};

// Calculate correlation between two segments to see if they match visually/audibly
const calculateCorrelation = (data: Float32Array, idxA: number, idxB: number, window: number): number => {
    if (idxA < 0 || idxB < 0 || idxA + window >= data.length || idxB + window >= data.length) return 0;
    
    let sum = 0;
    for (let i = 0; i < window; i++) {
        sum += Math.abs(data[idxA + i] - data[idxB + i]);
    }
    // Lower sum means better match (difference)
    // Normalize to a score 0-100
    const avgDiff = sum / window;
    const score = Math.max(0, 100 - (avgDiff * 200)); // Arbitrary scaling
    return score;
}

export const detectLoopPoints = (buffer: AudioBuffer): LoopPoint[] => {
  const data = buffer.getChannelData(0); // Analyze left channel
  const len = data.length;
  const points: LoopPoint[] = [];

  // Strategy:
  // 1. Find a good end point (usually near the end of the file, on a zero crossing).
  // 2. Search backwards for a start point that matches the waveform around the end point.

  // Define candidate end points: 100%, 75%, 50% of file length (simplified)
  // Ensure we don't look for points outside of data
  const candidateEndRegions = [
      len - 100, 
      Math.floor(len * 0.75), 
      Math.floor(len * 0.5)
  ].filter(idx => idx > 1000); // Filter out too small indices

  let idCounter = 1;

  candidateEndRegions.forEach(regionEndTarget => {
      const windowSearch = 2000; // Search +/- samples for zero crossing
      const validEnd = findZeroCrossing(data, regionEndTarget, windowSearch);
      
      // Skip if validEnd is too close to start, making meaningful looping impossible
      if (validEnd < 44100 / 2) return; // Minimum 0.5s loop

      // Scan candidate start points
      // Safeguard: Ensure step is at least 1 to avoid infinite loop
      const searchStep = Math.max(10, Math.floor(validEnd / 100)); 
      
      let bestStart = 0;
      let bestScore = -1;

      // Limit the start point search range to ensure a minimum loop length (e.g. 1000 samples)
      const maxStartIndex = validEnd - 1000;
      
      for (let i = 0; i < maxStartIndex; i += searchStep) { 
          // Find nearest zero crossing to candidate i
          const candidateStart = findZeroCrossing(data, i, 100);
          
          if (candidateStart >= maxStartIndex) continue;

          // Compare waveform around start vs around end
          const score = calculateCorrelation(data, candidateStart, validEnd, 500);
          
          if (score > bestScore) {
              bestScore = score;
              bestStart = candidateStart;
          }
      }

      if (bestScore > 60) {
          points.push({
              id: idCounter++,
              start: bestStart,
              end: validEnd,
              score: Math.round(bestScore),
              name: `Auto Loop ${idCounter}`
          });
      }
  });

  // Sort by score
  const results = points.sort((a, b) => b.score - a.score).slice(0, 3);
  
  return results;
};