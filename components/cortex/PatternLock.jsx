"use client";

import { useRef, useState, useCallback } from "react";

const GRID = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export default function PatternLock({ onComplete, label = "Draw your pattern" }) {
  const containerRef = useRef(null);
  const [selected, setSelected] = useState([]);
  const [dragging, setDragging] = useState(false);

  const getDotFromPoint = useCallback((clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el || el.dataset.dot === undefined) return null;
    return Number(el.dataset.dot);
  }, []);

  const addDot = useCallback((dot) => {
    setSelected((prev) => (prev.includes(dot) ? prev : [...prev, dot]));
  }, []);

  const handleStart = (dot) => {
    setDragging(true);
    setSelected([dot]);
  };

  const handleMove = (e) => {
    if (!dragging) return;
    const point = e.touches ? e.touches[0] : e;
    const dot = getDotFromPoint(point.clientX, point.clientY);
    if (dot !== null) addDot(dot);
  };

  const handleEnd = () => {
    setDragging(false);

    setSelected((current) => {
      if (current.length >= 4 && onComplete) {
        onComplete(current.join("-"));
      }
      return current;
    });

    setTimeout(() => setSelected([]), 400);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-red-400 text-sm tracking-widest uppercase">{label}</p>

      <div
        ref={containerRef}
        onMouseMove={handleMove}
        onTouchMove={handleMove}
        onMouseUp={handleEnd}
        onTouchEnd={handleEnd}
        onMouseLeave={() => dragging && handleEnd()}
        className="grid grid-cols-3 gap-8 p-6 select-none"
        style={{ touchAction: "none" }}
      >
        {GRID.map((dot) => (
          <div
            key={dot}
            data-dot={dot}
            onMouseDown={() => handleStart(dot)}
            onTouchStart={() => handleStart(dot)}
            className="w-6 h-6 rounded-full border-2 transition-colors"
            style={{
              borderColor: selected.includes(dot) ? "#ff3b30" : "#4a0400",
              backgroundColor: selected.includes(dot) ? "#ff2a10" : "#000",
              boxShadow: selected.includes(dot)
                ? "0 0 12px rgba(255,40,20,0.85)"
                : "none",
            }}
          />
        ))}
      </div>

      <p className="text-xs text-gray-500">Kam se kam 4 points connect karo</p>
    </div>
  );
}
