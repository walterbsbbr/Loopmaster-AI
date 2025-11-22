export interface LoopPoint {
  id: number;
  start: number; // in samples
  end: number;   // in samples
  score: number; // 0-100 confidence
  name: string;
}

export interface AudioFileMetadata {
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
}

export enum PlaybackState {
  STOPPED,
  PLAYING,
  LOOPING
}

export interface BatchItem {
  id: string;
  file: File;
  status: 'pending' | 'loaded' | 'processed' | 'error';
  loopPoints: LoopPoint[];
  selectedLoopId: number | null;
  smartName: string;
  duration?: number; // Only set after initial quick scan or full load
}