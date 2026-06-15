"use client";

import React from "react";

interface DoodleProps {
  className?: string;
  style?: React.CSSProperties;
}

export function DoodleBackground({ className = "", style }: DoodleProps) {
  return (
    <div
      className={`fixed inset-0 -z-10 overflow-hidden pointer-events-none ${className}`}
      style={{
        backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        opacity: 0.8,
        ...style,
      }}
    >
      {/* Styles for hand-drawn float animations */}
      <style jsx>{`
        @keyframes float-1 {
          0%, 100% { transform: translateY(0) rotate(-2deg) scale(1); }
          50% { transform: translateY(-15px) rotate(3deg) scale(1.03); }
        }
        @keyframes float-2 {
          0%, 100% { transform: translateY(0) rotate(3deg) scale(1); }
          50% { transform: translateY(-20px) rotate(-3deg) scale(0.97); }
        }
        @keyframes float-3 {
          0%, 100% { transform: translateY(0) rotate(-4deg) scale(1); }
          50% { transform: translateY(-12px) rotate(4deg) scale(1.02); }
        }
        .float-doodle-1 { animation: float-1 8s ease-in-out infinite; }
        .float-doodle-2 { animation: float-2 10s ease-in-out infinite; }
        .float-doodle-3 { animation: float-3 9s ease-in-out infinite; }
        .doodle-path {
          stroke: var(--muted-foreground);
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
          opacity: 0.25;
          transition: all 0.3s ease;
        }
        .dark .doodle-path {
          stroke: var(--primary);
          opacity: 0.15;
        }
        .doodle-container:hover .doodle-path {
          stroke: var(--primary);
          opacity: 0.7;
          stroke-width: 2.2;
        }
        .dark .doodle-container:hover .doodle-path {
          stroke: var(--primary);
          opacity: 0.6;
          stroke-width: 2.2;
        }
      `}</style>

      {/* Doodle 1: Sketched Pickaxe (Top Left) */}
      <div
        className="doodle-container float-doodle-1 absolute left-[5%] top-[12%] w-20 h-20 md:w-28 md:h-28 cursor-pointer pointer-events-auto"
        title="Sketched Pickaxe"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Pickaxe Head */}
          <path
            className="doodle-path"
            d="M 35 15 C 45 10, 65 10, 75 20 C 72 25, 68 28, 62 25 C 55 22, 45 28, 42 35 C 32 30, 25 22, 35 15 Z"
          />
          {/* Overlapping sketch lines on head */}
          <path className="doodle-path" d="M 40 18 C 50 13, 62 13, 70 20" />
          {/* Pickaxe Handle */}
          <path className="doodle-path" d="M 52 23 L 15 70 C 12 74, 10 77, 13 80 C 16 83, 19 81, 22 78 L 59 31" />
          <path className="doodle-path" d="M 50 25 L 18 72" />
          {/* Handle Grip Details */}
          <path className="doodle-path" d="M 18 67 C 19 69, 21 69, 21 67" />
          <path className="doodle-path" d="M 23 61 C 24 63, 26 63, 26 61" />
        </svg>
      </div>

      {/* Doodle 2: Sketched Creeper Face (Top Right) */}
      <div
        className="doodle-container float-doodle-2 absolute right-[8%] top-[10%] w-24 h-24 md:w-32 md:h-32 cursor-pointer pointer-events-auto"
        title="Sketchy Creeper"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Main Face Outline (slightly wavy square) */}
          <path
            className="doodle-path"
            d="M 15 15 C 35 12, 65 17, 85 15 C 88 35, 83 65, 85 85 C 65 88, 35 83, 15 85 C 12 65, 17 35, 15 15 Z"
          />
          {/* Extra sketch outline to double the stroke */}
          <path
            className="doodle-path"
            d="M 17 18 C 35 15, 65 19, 82 17 C 84 35, 80 65, 82 82 C 65 84, 35 81, 18 82 C 15 65, 19 35, 17 18"
          />
          {/* Left Eye */}
          <path className="doodle-path" d="M 25 30 L 40 30 L 40 45 L 25 45 Z" />
          <path className="doodle-path" d="M 28 33 L 37 33 L 37 42 L 28 42 Z" />
          {/* Right Eye */}
          <path className="doodle-path" d="M 60 30 L 75 30 L 75 45 L 60 45 Z" />
          <path className="doodle-path" d="M 63 33 L 72 33 L 72 42 L 63 42 Z" />
          {/* Nose & Mouth */}
          <path className="doodle-path" d="M 40 45 L 60 45 L 60 60 L 52 60 L 52 72 L 48 72 L 48 60 L 40 60 Z" />
          <path className="doodle-path" d="M 43 48 L 57 48 L 57 57 L 50 57 L 50 69 L 43 69 Z" />
        </svg>
      </div>

      {/* Doodle 3: Sketched Grass Block (Middle Left) */}
      <div
        className="doodle-container float-doodle-3 absolute left-[4%] top-[45%] w-24 h-24 md:w-32 md:h-32 hidden sm:block cursor-pointer pointer-events-auto"
        title="Sketchy Grass Block"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Top Face (isometric rhombus) */}
          <path className="doodle-path" d="M 50 15 L 80 30 L 50 45 L 20 30 Z" />
          <path className="doodle-path" d="M 50 18 L 76 31 L 50 42 L 24 31 Z" />
          
          {/* Left Face */}
          <path className="doodle-path" d="M 20 30 L 20 70 L 50 85 L 50 45 Z" />
          {/* Right Face */}
          <path className="doodle-path" d="M 50 45 L 50 85 L 80 70 L 80 30 Z" />
          
          {/* Grass Hangover line (doodled waves/spikes) */}
          <path className="doodle-path" d="M 20 35 L 28 42 L 32 37 L 40 45 L 48 39 L 50 45 L 58 38 L 68 46 L 72 39 L 80 35" />
          <path className="doodle-path" d="M 20 37 L 27 44 L 33 39 L 41 47 L 47 41 L 50 47 L 57 40 L 67 48 L 73 41 L 80 37" />
        </svg>
      </div>

      {/* Doodle 4: Sketched Diamond Sword (Middle Right) */}
      <div
        className="doodle-container float-doodle-1 absolute right-[5%] top-[40%] w-24 h-24 md:w-32 md:h-32 cursor-pointer pointer-events-auto"
        title="Sketched Sword"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Blade pointing up right */}
          <path className="doodle-path" d="M 35 65 L 75 25 C 77 23, 80 23, 82 25 C 84 27, 84 30, 82 32 L 42 72 Z" />
          {/* Inner details for blade edge */}
          <path className="doodle-path" d="M 39 63 L 73 29 M 75 25 L 79 29" />
          
          {/* Guard */}
          <path className="doodle-path" d="M 25 62 C 28 58, 38 52, 42 55 L 35 65 C 32 68, 26 58, 25 62 Z" />
          <path className="doodle-path" d="M 45 72 C 41 75, 35 85, 38 88 L 48 78 C 51 75, 41 69, 45 72 Z" />
          
          {/* Hilt / Handle */}
          <path className="doodle-path" d="M 36 68 L 20 84 C 18 86, 15 85, 13 83 C 11 81, 10 78, 12 76 L 28 60" />
          {/* Pommel */}
          <path className="doodle-path" d="M 15 81 C 12 84, 10 81, 13 78 C 16 75, 18 78, 15 81 Z" />
        </svg>
      </div>

      {/* Doodle 5: Sketched Potion Bottle (Bottom Left) */}
      <div
        className="doodle-container float-doodle-2 absolute left-[8%] bottom-[12%] w-20 h-20 md:w-28 md:h-28 hidden md:block cursor-pointer pointer-events-auto"
        title="Sketchy Potion"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Bottle Body */}
          <path
            className="doodle-path"
            d="M 42 28 L 42 18 C 42 16, 58 16, 58 18 L 58 28 C 65 30, 80 40, 80 55 C 80 75, 68 85, 50 85 C 32 85, 20 75, 20 55 C 20 40, 35 30, 42 28 Z"
          />
          {/* Liquid level */}
          <path className="doodle-path" d="M 23 58 C 35 54, 65 62, 77 58" />
          <path className="doodle-path" d="M 26 62 C 38 58, 62 66, 74 62" />
          {/* Bubbles */}
          <circle cx="35" cy="48" r="3" className="doodle-path" />
          <circle cx="50" cy="42" r="2.5" className="doodle-path" />
          <circle cx="62" cy="50" r="4" className="doodle-path" />
          {/* Cork */}
          <path className="doodle-path" d="M 45 17 L 45 10 C 45 8, 55 8, 55 10 L 55 17" />
          {/* Cork lines */}
          <path className="doodle-path" d="M 48 13 L 52 13" />
        </svg>
      </div>

      {/* Doodle 6: Sketched Gear / Modding Icon (Bottom Right) */}
      <div
        className="doodle-container float-doodle-3 absolute right-[6%] bottom-[15%] w-20 h-20 md:w-28 md:h-28 cursor-pointer pointer-events-auto"
        title="Sketched Modding Gear"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Center Circle */}
          <circle cx="50" cy="50" r="15" className="doodle-path" />
          <circle cx="50" cy="50" r="13" className="doodle-path" />
          
          {/* Gear Outer Circle and Teeth */}
          <path
            className="doodle-path"
            d="M 50 22 
               C 47 22, 47 28, 44 29
               C 41 29, 37 25, 34 27
               C 31 29, 33 34, 31 37
               C 28 37, 22 37, 22 40
               C 22 43, 28 43, 29 46
               C 29 49, 25 53, 27 56
               C 29 59, 34 57, 37 59
               C 37 62, 37 68, 40 68
               C 43 68, 43 62, 46 61
               C 49 61, 53 65, 56 63
               C 59 61, 57 56, 59 53
               C 62 53, 68 53, 68 50
               C 68 47, 62 47, 61 44
               C 61 41, 65 37, 63 34
               C 61 31, 56 33, 53 31
               C 53 28, 53 22, 50 22 Z"
          />
          {/* Accent drawing lines */}
          <path className="doodle-path" d="M 50 25 C 53 25, 62 30, 62 35" />
          <path className="doodle-path" d="M 38 60 C 35 55, 35 45, 40 40" />
        </svg>
      </div>

      {/* Doodle 7: Curly Connector Arrow (Hero Right) */}
      <div
        className="doodle-container float-doodle-1 absolute right-[25%] top-[25%] w-16 h-16 hidden lg:block cursor-pointer pointer-events-auto"
        title="Sketched Arrow"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Loop line arrow */}
          <path
            className="doodle-path"
            d="M 15 20 C 30 10, 50 40, 40 60 C 32 75, 60 70, 75 50"
          />
          {/* Arrow head */}
          <path className="doodle-path" d="M 65 48 L 75 50 L 73 62" />
          <path className="doodle-path" d="M 68 52 L 73 53 L 72 58" />
        </svg>
      </div>

      {/* Doodle 8: Sketched Sparkles / Redstone (Top Center) */}
      <div
        className="doodle-container float-doodle-3 absolute left-[45%] top-[6%] w-12 h-12 hidden md:block cursor-pointer pointer-events-auto"
        title="Redstone Sparkles"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Big Sparkle */}
          <path className="doodle-path" d="M 50 20 Q 50 50, 20 50 Q 50 50, 50 80 Q 50 50, 80 50 Q 50 50, 50 20 Z" />
          {/* Small Sparkle 1 */}
          <path className="doodle-path" d="M 25 25 Q 25 35, 15 35 Q 25 35, 25 45 Q 25 35, 35 35 Q 25 35, 25 25 Z" />
          {/* Small Sparkle 2 */}
          <path className="doodle-path" d="M 75 65 Q 75 72, 68 72 Q 75 72, 75 79 Q 75 72, 82 72 Q 75 72, 75 65 Z" />
        </svg>
      </div>

      {/* Doodle 9: Sketched Chest (Bottom Center Left) */}
      <div
        className="doodle-container float-doodle-2 absolute left-[28%] bottom-[8%] w-16 h-16 hidden lg:block cursor-pointer pointer-events-auto"
        title="Sketched Chest"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Chest Outline 3D */}
          <path className="doodle-path" d="M 15 35 L 50 20 L 85 35 L 85 70 L 50 85 L 15 70 Z" />
          {/* Lid dividing line */}
          <path className="doodle-path" d="M 15 48 L 50 35 L 85 48" />
          {/* Center lock */}
          <path className="doodle-path" d="M 45 35 L 55 38 L 55 46 L 45 43 Z" />
          {/* Corner bands */}
          <path className="doodle-path" d="M 22 32 L 22 68 M 78 32 L 78 68" />
          <path className="doodle-path" d="M 48 21 L 48 35 M 48 44 L 48 83" />
        </svg>
      </div>

      {/* Doodle 10: Sketched Loop & Star (Hero Left) */}
      <div
        className="doodle-container float-doodle-3 absolute left-[22%] top-[30%] w-16 h-16 hidden lg:block cursor-pointer pointer-events-auto"
        title="Sketched Spark"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Loop squiggle */}
          <path className="doodle-path" d="M 20 70 C 40 85, 80 75, 65 40 C 50 10, 15 40, 45 50" />
          {/* Tiny handdrawn star */}
          <path className="doodle-path" d="M 70 20 L 73 28 L 81 29 L 75 35 L 77 43 L 70 38 L 63 43 L 65 35 L 59 29 L 67 28 Z" />
        </svg>
      </div>
    </div>
  );
}
