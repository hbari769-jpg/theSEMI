import React, { useEffect, useRef } from 'react';

interface SpatialAtmosphereProps {
  isStreaming?: boolean;
}

/**
 * Minimalist Ambient Atmosphere
 * Conforms strictly to Aestific Design Direction:
 * - True Black (#000000) canvas in Dark Mode with subtle micro-points
 * - Clean White / Off-white in Light Mode
 * - Free of distracting neon ribbons
 */
export const SpatialAtmosphere: React.FC<SpatialAtmosphereProps> = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize, { passive: true });

    interface StarPoint {
      x: number;
      y: number;
      radius: number;
      alpha: number;
      baseAlpha: number;
      speed: number;
    }

    const count = 30;
    const particles: StarPoint[] = Array.from({ length: count }, () => {
      const baseAlpha = Math.random() * 0.25 + 0.05;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.0 + 0.3,
        alpha: baseAlpha,
        baseAlpha,
        speed: Math.random() * 0.003 + 0.001,
      };
    });

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        p.alpha += p.speed;
        if (p.alpha > p.baseAlpha + 0.15 || p.alpha < p.baseAlpha - 0.05) {
          p.speed = -p.speed;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = Math.max(0.02, Math.min(0.35, p.alpha));
        ctx.fill();
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 select-none bg-white dark:bg-black transition-colors duration-200">
      {/* Subtle Micro-particle Stardust in dark mode */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-40 hidden dark:block z-0"
      />
    </div>
  );
};
