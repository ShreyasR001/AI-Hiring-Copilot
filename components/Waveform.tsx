
import React, { useEffect, useRef } from 'react';

interface WaveformProps {
  isActive: boolean;
  isModelTalking: boolean;
}

const Waveform: React.FC<WaveformProps> = ({ isActive, isModelTalking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const barCount = 40;
    const bars: number[] = new Array(barCount).fill(0).map(() => Math.random() * 20 + 5);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = width / barCount - 2;

      ctx.fillStyle = isModelTalking ? '#3b82f6' : '#10b981';

      for (let i = 0; i < barCount; i++) {
        const target = isModelTalking || !isActive ? Math.random() * 40 + 10 : 2;
        bars[i] += (target - bars[i]) * 0.1;
        
        const h = bars[i];
        const x = i * (barWidth + 2);
        const y = (height - h) / 2;
        
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, h, 2);
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isActive, isModelTalking]);

  return (
    <canvas 
      ref={canvasRef} 
      width={400} 
      height={100} 
      className="w-full max-w-md mx-auto rounded-lg bg-zinc-900/50"
    />
  );
};

export default Waveform;
