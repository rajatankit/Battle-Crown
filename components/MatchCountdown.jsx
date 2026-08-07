"use client";

import { useState, useEffect } from "react";

// Fancy live countdown badge — shows LIVE NOW / STARTING SOON / countdown timer
// depending on how close the match time is.
export default function MatchCountdown({ matchTime }) {
  const [timeLeft, setTimeLeft] = useState(null);
  const [status, setStatus] = useState("upcoming"); // upcoming | soon | live | ended

  useEffect(() => {
    if (!matchTime) return;

    const target = new Date(matchTime).getTime();
    if (isNaN(target)) return;

    const tick = () => {
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setStatus("live");
        setTimeLeft(null);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      setTimeLeft({ days, hours, mins, secs });
      setStatus(diff < 15 * 60 * 1000 ? "soon" : "upcoming"); // "soon" = within 15 mins
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [matchTime]);

  if (!matchTime) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-gray-700 bg-black/50 text-gray-500 text-[10px] font-mono uppercase font-bold">
        <span>🕒</span> Time TBA
      </div>
    );
  }

  // LIVE state — pulsing red glow
  if (status === "live") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-red-500 bg-red-950/60 text-red-400 text-[10px] font-mono uppercase font-bold shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-pulse">
        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
        🔴 LIVE NOW
      </div>
    );
  }

  const readableDate = new Date(matchTime).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // STARTING SOON — pulsing yellow glow
  if (status === "soon") {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-yellow-500 bg-yellow-950/60 text-yellow-300 text-[10px] font-mono uppercase font-bold shadow-[0_0_10px_rgba(234,179,8,0.5)] animate-pulse w-fit">
          <span>⚡</span> STARTING SOON
        </div>
        {timeLeft && (
          <span className="text-[10px] font-mono text-yellow-400 font-bold tracking-wider">
            {String(timeLeft.mins).padStart(2, "0")}:{String(timeLeft.secs).padStart(2, "0")}
          </span>
        )}
      </div>
    );
  }

  // UPCOMING — cyan glow countdown
  return (
    <div className="flex flex-col gap-0.5">
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-cyan-600 bg-cyan-950/50 text-cyan-300 text-[10px] font-mono uppercase font-bold shadow-[0_0_8px_rgba(34,211,238,0.35)] w-fit">
        <span>🕒</span> {readableDate}
      </div>
      {timeLeft && (
        <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-cyan-400 tracking-wider pl-0.5">
          {timeLeft.days > 0 && <span>{timeLeft.days}d </span>}
          <span>{String(timeLeft.hours).padStart(2, "0")}h</span>
          <span>{String(timeLeft.mins).padStart(2, "0")}m</span>
          <span>{String(timeLeft.secs).padStart(2, "0")}s</span>
        </div>
      )}
    </div>
  );
}