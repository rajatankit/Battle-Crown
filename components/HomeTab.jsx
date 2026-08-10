"use client";

import { useMemo } from "react";
import NotificationBell from "./NotificationBell";
import MatchCountdown from "./MatchCountdown";
import BottomNav from "./BottomNav";

// Put ff-bg.jpg and bgmi-bg.jpg inside your project's /public/images folder —
// these are used as fallback art whenever a tournament doesn't have its own
// admin-uploaded slide image yet, and as the background for the game-select cards.
const GAME_BACKGROUNDS = {
  bgmi: "/images/bgmi-bg.jpg",
  ff: "/images/ff-bg.jpg",
};

function isFreeFireEntry(entry) {
  const name = (entry?.game || entry?.gameType || entry?.title || "").toLowerCase();
  return name.includes("free") || name.includes("ff");
}

// ─────────────────────────────────────────────────────────────────────────
// HomeTab — mobile-first home screen for the dashboard.
//
// Self-contained presentational component. The parent (dashboard/page.js)
// passes down everything it already computes — no duplicate Firebase/Prisma
// calls happen here.
// ─────────────────────────────────────────────────────────────────────────
export default function HomeTab({
  displayName = "Player",
  playerLevel = 1,
  protectionPoints = 5,
  crowns = 0,
  liveTournament = null,
  startingSoon = [],
  matchesTowardNext = 0,
  matchesNeededForNext = 1,
  bgmiCount = 0,
  ffCount = 0,
  onJoin = () => {},
  onNavigate = () => {},
  activeTab = "home",
}) {
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  const progressPct = Math.min(
    (matchesTowardNext / Math.max(matchesNeededForNext, 1)) * 100,
    100
  );

  // Fallback art for the live-tournament hero: use the admin-uploaded slide
  // if it exists, otherwise fall back to the game's default background art.
  const liveBg =
    liveTournament?.slides?.[0] ||
    (liveTournament
      ? isFreeFireEntry(liveTournament)
        ? GAME_BACKGROUNDS.ff
        : GAME_BACKGROUNDS.bgmi
      : null);

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white font-mono pb-24">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <span className="text-lg font-black italic tracking-tight">
          BATTLE <span className="text-cyan-400">CROWN</span>
        </span>
        <NotificationBell />
      </header>

      {/* ── Greeting card ───────────────────────────────────────── */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-500 to-yellow-500 flex items-center justify-center text-lg font-black text-black flex-shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-white">
              {greeting}, {displayName} 👋
            </p>
            <p className="text-[11px] text-gray-400">Ready for your next battle?</p>
          </div>
        </div>

        {/* Stat pills */}
        <div className="flex gap-2 mt-3">
          <span className="flex items-center gap-1 bg-[#161d2b] border border-cyan-800/60 text-cyan-300 text-[10px] font-bold px-2.5 py-1 rounded-full">
            🛡️ Lvl {playerLevel}
          </span>
          <span className="flex items-center gap-1 bg-[#161d2b] border border-cyan-800/60 text-cyan-300 text-[10px] font-bold px-2.5 py-1 rounded-full">
            🔷 Prot: {protectionPoints}
          </span>
          <span className="flex items-center gap-1 bg-[#161d2b] border border-yellow-700/60 text-yellow-400 text-[10px] font-bold px-2.5 py-1 rounded-full">
            👑 Crowns {crowns}
          </span>
        </div>
      </div>

      {/* ── Live tournament hero ────────────────────────────────── */}
      {liveTournament && (
        <div className="px-4 mb-6">
          <div
            onClick={() => onJoin(liveTournament)}
            className="relative rounded-xl overflow-hidden border border-red-600/50 shadow-lg shadow-red-950/40 cursor-pointer h-40"
          >
            {liveBg && (
              <img
                src={liveBg}
                alt={liveTournament.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />

            <span className="absolute top-3 left-3 flex items-center gap-1 bg-red-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded animate-pulse">
              🔴 Live Now
            </span>

            <div className="absolute bottom-3 left-3 right-3">
              <h3 className="text-base font-black uppercase text-white">{liveTournament.title}</h3>
              <div className="flex items-center gap-4 mt-1 text-[11px]">
                <span className="text-yellow-400 font-bold">
                  ₹{liveTournament.firstPrize || liveTournament.prizePool || 0} Prize Pool
                </span>
                <span className="text-gray-300">
                  {liveTournament.joinedCount || 0} / {liveTournament.maxSlots || 100} Players
                </span>
              </div>
              <button className="mt-2 bg-cyan-400 hover:bg-cyan-300 text-black text-[11px] font-black uppercase px-4 py-1.5 rounded">
                Join Now →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Choose your battle ──────────────────────────────────── */}
      <div className="px-4 mb-6">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
          // Choose Your Battle
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate("battles", "bgmi")}
            className="relative overflow-hidden rounded-xl border border-cyan-800/60 hover:border-cyan-500 transition h-36 text-left"
          >
            <div
              className="absolute inset-0 bg-cover bg-center scale-105 group-hover:scale-100 transition-transform duration-500"
              style={{ backgroundImage: `url(${GAME_BACKGROUNDS.bgmi})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f17] via-[#0b0f17]/70 to-[#0b0f17]/20" />
            <div className="relative z-10 p-4 h-full flex flex-col justify-end">
              <span className="text-2xl">🛡️</span>
              <p className="text-lg font-black text-white mt-1">{bgmiCount}</p>
              <p className="text-[10px] text-gray-300 uppercase mb-1">Tournaments</p>
              <span className="text-[10px] font-bold text-cyan-300">Play Now →</span>
            </div>
          </button>

          <button
            onClick={() => onNavigate("battles", "ff")}
            className="relative overflow-hidden rounded-xl border border-orange-800/60 hover:border-orange-500 transition h-36 text-left"
          >
            <div
              className="absolute inset-0 bg-cover bg-center scale-105 group-hover:scale-100 transition-transform duration-500"
              style={{ backgroundImage: `url(${GAME_BACKGROUNDS.ff})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f17] via-[#0b0f17]/70 to-[#0b0f17]/20" />
            <div className="relative z-10 p-4 h-full flex flex-col justify-end">
              <span className="text-2xl">🔥</span>
              <p className="text-lg font-black text-white mt-1">{ffCount}</p>
              <p className="text-[10px] text-gray-300 uppercase mb-1">Tournaments</p>
              <span className="text-[10px] font-bold text-orange-300">Play Now →</span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Starting soon ───────────────────────────────────────── */}
      <div className="px-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
            // Starting Soon
          </h2>
          <button onClick={() => onNavigate("battles")} className="text-[10px] font-bold text-cyan-400">
            View All
          </button>
        </div>
        <div className="space-y-2">
          {startingSoon.length === 0 && (
            <p className="text-[11px] text-gray-500 italic py-3 text-center">
              No upcoming matches right now — check back soon.
            </p>
          )}
          {startingSoon.map((t) => {
            const thumb = t.slides?.[0] || (isFreeFireEntry(t) ? GAME_BACKGROUNDS.ff : GAME_BACKGROUNDS.bgmi);
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 bg-[#0f141c]/90 border border-gray-800 rounded-lg p-2.5"
              >
                <img src={thumb} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {t.game?.toUpperCase() || "MATCH"} • {t.map}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    ₹{t.entryFee} Entry • {t.joinedCount || 0} / {t.maxSlots || 100} Players
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <MatchCountdown matchTime={t.date} />
                </div>
                <button
                  onClick={() => onJoin(t)}
                  className="bg-cyan-400 hover:bg-cyan-300 text-black text-[10px] font-black uppercase px-3 py-1.5 rounded flex-shrink-0"
                >
                  Join
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Your progress ───────────────────────────────────────── */}
      <div className="px-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
            // Your Progress
          </h2>
          <button onClick={() => onNavigate("profile")} className="text-[10px] font-bold text-cyan-400">
            View Details
          </button>
        </div>
        <div className="bg-[#0f141c]/90 border border-gray-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs font-bold text-white">Level {playerLevel}</span>
            <span className="text-[10px] text-gray-400">
              {matchesTowardNext} / {matchesNeededForNext} Matches
            </span>
          </div>
          <div className="w-full h-2 bg-gray-900 rounded overflow-hidden border border-gray-800">
            <div
              className="h-full bg-gradient-to-r from-yellow-500 to-amber-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5">
            {Math.max(matchesNeededForNext - matchesTowardNext, 0)} matches to reach Level {playerLevel + 1}
          </p>
          <div className="flex gap-4 mt-3 pt-3 border-t border-gray-800">
            <div className="flex items-center gap-1.5">
              <span className="text-yellow-400">👑</span>
              <span className="text-[11px] text-gray-300">
                Crowns <strong className="text-white">{crowns}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-cyan-400">🛡️</span>
              <span className="text-[11px] text-gray-300">
                Protection <strong className="text-white">{protectionPoints}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      <BottomNav activeTab={activeTab} onNavigate={onNavigate} />
    </div>
  );
}