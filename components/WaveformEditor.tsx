import React, { useEffect, useRef, useState } from 'react';
import { LoopPoint } from '../types';

interface WaveformEditorProps {
  buffer: AudioBuffer;
  loopPoint: LoopPoint | null;
  onLoopPointChange: (lp: LoopPoint) => void;
  isPlaying: boolean;
  currentTime: number;
  onSeek: (time: number) => void;
}

const WaveformEditor: React.FC<WaveformEditorProps> = ({
  buffer,
  loopPoint,
  onLoopPointChange,
  currentTime,
  onSeek
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);
    
    // Grid
    ctx.strokeStyle = '#1f2937';
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(width, amp);
    ctx.stroke();

    // Waveform
    ctx.beginPath();
    ctx.strokeStyle = '#22d3ee'; // Cyan 400
    ctx.lineWidth = 1;

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();

    // Loop Points overlay
    if (loopPoint) {
        const startX = (loopPoint.start / buffer.length) * width;
        const endX = (loopPoint.end / buffer.length) * width;

        // Active Loop Region
        ctx.fillStyle = 'rgba(6, 182, 212, 0.2)'; // Cyan transparent
        ctx.fillRect(startX, 0, endX - startX, height);

        // Lines
        ctx.strokeStyle = '#fbbf24'; // Amber 400
        ctx.lineWidth = 2;
        
        // Start Line
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.stroke();

        // End Line
        ctx.beginPath();
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, height);
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#fbbf24';
        ctx.font = '10px monospace';
        ctx.fillText('LOOP START', startX + 4, 12);
        ctx.fillText('LOOP END', endX - 55, height - 5);
    }

    // Playhead
    const playheadX = (currentTime / buffer.duration) * width;
    ctx.strokeStyle = '#ef4444'; // Red 500
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  };

  useEffect(() => {
    drawWaveform();
  }, [buffer, loopPoint, currentTime]);

  const handleMouseDown = (e: React.MouseEvent) => {
      if (!loopPoint || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const totalSamples = buffer.length;
      const width = rect.width;
      
      const startX = (loopPoint.start / totalSamples) * width;
      const endX = (loopPoint.end / totalSamples) * width;

      const threshold = 10;

      if (Math.abs(x - startX) < threshold) {
          setIsDragging('start');
      } else if (Math.abs(x - endX) < threshold) {
          setIsDragging('end');
      } else {
          // Seek
          const time = (x / width) * buffer.duration;
          onSeek(time);
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging || !loopPoint || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      x = Math.max(0, Math.min(x, rect.width));
      
      const sample = Math.floor((x / rect.width) * buffer.length);
      
      const newLoop = { ...loopPoint };
      if (isDragging === 'start') {
          newLoop.start = Math.min(sample, newLoop.end - 100);
      } else {
          newLoop.end = Math.max(sample, newLoop.start + 100);
      }
      onLoopPointChange(newLoop);
  };

  const handleMouseUp = () => {
      setIsDragging(null);
  };

  return (
    <div 
        ref={containerRef}
        className="relative w-full h-64 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden cursor-crosshair shadow-inner"
    >
      <canvas
        ref={canvasRef}
        width={containerRef.current?.clientWidth || 800}
        height={256}
        className="w-full h-full block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
};

export default WaveformEditor;
