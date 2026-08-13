"use client";

import { useMemo, useState, useEffect } from "react";
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

const GAME_LABELS = {
  bgmi: { name: "BGMI", icon: "🛡️" },
  ff: { name: "FREE FIRE", icon: "🔥" },
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
//
// NOTE on props: `liveTournament` (single) still works exactly as before.
// If the parent instead passes `liveTournaments` (an array of the currently
// live tournaments, e.g. one BGMI + one Free Fire), the hero will auto-rotate
// between them every 3s. Nothing breaks if only the old single prop is sent —
// this is purely an additive, backward-compatible display change.
// ─────────────────────────────────────────────────────────────────────────
export default function HomeTab({
  displayName = "Player",
  playerLevel = 1,
  protectionPoints = 5,
  crowns = 0,
  bgmiIgn="",
  bgmiUid="",
  ffIgn="",
  ffUid="",
  tournaments = [],
  liveTournament = null,
  liveTournaments = null,
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

  const greetingName = useMemo(() => {
    if (bgmiIgn && ffIgn) return `${bgmiIgn} / ${ffIgn}`;
    if (bgmiIgn) return bgmiIgn;
    if (ffIgn) return ffIgn;
    return "Player";
  }, [bgmiIgn, ffIgn]);

  const progressPct = Math.min(
    (matchesTowardNext / Math.max(matchesNeededForNext, 1)) * 100,
    100
  );

  // Normalize to a list so the hero can rotate when there's more than one
  // live tournament, while staying identical in behavior when there's just one.
 const liveList = useMemo(() => {
  if (Array.isArray(tournaments) && tournaments.length > 0) {
    const liveFromAll = tournaments.filter(
      (t) => t.status === "live"
    );

    if (liveFromAll.length > 0) {
      return liveFromAll;
    }
  }

  if (Array.isArray(liveTournaments) && liveTournaments.length > 0) {
    return liveTournaments;
  }

  return liveTournament ? [liveTournament] : [];
}, [tournaments, liveTournaments, liveTournament]);

  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    if (liveList.length < 2) return;
    const id = setInterval(() => {
      setHeroIndex((i) => (i + 1) % liveList.length);
    }, 3000);
    return () => clearInterval(id);
  }, [liveList.length]);

  useEffect(() => {
    setHeroIndex(0);
  }, [liveList.length]);

  const activeLive = liveList[heroIndex] || null;

  const liveGameCounts = useMemo(() => {
  const counts = {
    bgmi: 0,
    ff: 0,
  };

  if (!Array.isArray(tournaments)) {
    return counts;
  }

  tournaments.forEach((t) => {
    if (t.status !== "live") return;

    const name = (
      t.game ||
      t.gameType ||
      t.title ||
      ""
    ).toLowerCase();

    if (name.includes("free") || name.includes("ff")) {
      counts.ff += 1;
    } else {
      counts.bgmi += 1;
    }
  });

  return counts;
}, [tournaments]);

  const liveBg =
    activeLive?.slides?.[0] ||
    (activeLive
      ? isFreeFireEntry(activeLive)
        ? GAME_BACKGROUNDS.ff
        : GAME_BACKGROUNDS.bgmi
      : null);

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white font-mono pb-24">
      {/* ── Top bar ─────────────────────────────────────────────── */}
     {/* ── Top bar ─────────────────────────────────────────────── */}
<header className="flex items-start justify-between px-4 pt-5 pb-3">
  <div className="flex flex-col">

    {/* Battle Crown Logo */}
    <div className="flex items-baseline leading-none">
      <span className="text-[20px] font-black italic tracking-[-0.04em] text-white">
        BATTLE
      </span>

      <span className="text-[20px] font-black italic tracking-[-0.04em] text-cyan-400 ml-1.5">
        CROWN
      </span>
    </div>

    {/* Professional Arena Badge */}
    <div className="mt-2 flex items-center">
      <div
        className="
          inline-flex items-center gap-1.5
          px-2.5 py-1
          rounded-md
          bg-[#111925]
          border border-red-500/30
          shadow-[0_4px_15px_rgba(0,0,0,0.25)]
        "
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_7px_rgba(239,68,68,0.8)]" />

        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-200">
          DUAL
        </span>

        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-red-400">
          ESPORTS
        </span>

        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-400">
          ARENA
        </span>
      </div>
    </div>

  </div>

  <NotificationBell />
</header>

      {/* ── Greeting card ───────────────────────────────────────── */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-500 to-yellow-500 flex items-center justify-center text-lg font-black text-black flex-shrink-0">
            {greetingName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-white">
              {greeting}, {greetingName} 👋
            </p>
            <p className="text-[11px] text-gray-400">Ready for your next battle?🎮</p>
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

        {(bgmiIgn || ffIgn) && (
          <div className="flex flex-wrap gap-2 mt-2.5">
            {bgmiIgn && (
              <span className="flex items-center gap-1.5 bg-cyan-950/40 border border-cyan-700/50 text-cyan-300 text-[10px] font-bold px-2.5 py-1 rounded-full">
                🛡️ <span className="text-gray-400">BGMI:</span> {bgmiIgn}
              </span>
            )}
            {ffIgn && (
              <span className="flex items-center gap-1.5 bg-orange-950/40 border border-orange-700/50 text-orange-300 text-[10px] font-bold px-2.5 py-1 rounded-full">
                🔥 <span className="text-gray-400">FF:</span> {ffIgn}
              </span>
            )}
          </div>
        )}

      </div>

      {/* ── Live tournament hero (auto-rotates every 3s when there's more than one) ── */}
    {/* ── Live tournament hero — auto swipe every 3s ── */}
{liveList.length > 0 && (
  <div className="px-4 mb-6">

    {/* Slider viewport */}
    <div className="relative overflow-hidden rounded-xl">

      {/* Slider track */}
      <div
        className="flex transition-transform duration-700 ease-in-out"
        style={{
          transform: `translateX(-${heroIndex * 100}%)`,
        }}
      >
        {liveList.map((tournament, index) => {
          const isFF = isFreeFireEntry(tournament);

          const tournamentBg =
            tournament?.slides?.[0] ||
            (isFF
              ? GAME_BACKGROUNDS.ff
              : GAME_BACKGROUNDS.bgmi);

          return (
            <div
              key={tournament.id || index}
              className="relative min-w-full h-40 overflow-hidden rounded-xl border border-red-600/50 shadow-lg shadow-red-950/40 cursor-pointer"
              onClick={() => onJoin(tournament)}
            >

              {/* Background */}
              {tournamentBg && (
                <img
                  src={tournamentBg}
                  alt={tournament.title || "Live Tournament"}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}

              {/* Dark cinematic overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />

              {/* Game + Live badge */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5">

                <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded animate-pulse">
                  🔴 Live Now
                </span>

                <span
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                    isFF
                      ? "bg-orange-950/90 text-orange-300 border-orange-700/60"
                      : "bg-cyan-950/90 text-cyan-300 border-cyan-700/60"
                  }`}
                >
                  {isFF ? "🔥 Free Fire" : "🛡️ BGMI"}
                </span>

              </div>

              {/* Tournament content */}
              <div className="absolute bottom-3 left-3 right-3">

                <h3 className="text-base font-black uppercase text-white truncate">
                  {tournament.title}
                </h3>

                <div className="flex items-center gap-4 mt-1 text-[11px]">

                  <span className="text-yellow-400 font-bold">
                    ₹
                    {tournament.firstPrize ||
                      tournament.prizePool ||
                      0}{" "}
                    Prize Pool
                  </span>

                  <span className="text-gray-300">
                    {tournament.joinedCount || 0} /{" "}
                    {tournament.maxSlots ||
                      (isFF ? 50 : 100)}{" "}
                    Players
                  </span>

                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onJoin(tournament);
                  }}
                  className="mt-2 bg-cyan-400 hover:bg-cyan-300 text-black text-[11px] font-black uppercase px-4 py-1.5 rounded transition"
                >
                  Join Now →
                </button>

              </div>

            </div>
          );
        })}
      </div>
    </div>

    {/* Slide indicators */}
    {liveList.length > 1 && (
      <div className="flex justify-center items-center gap-1.5 mt-2">

        {liveList.map((tournament, i) => (
          <span
            key={tournament.id || i}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === heroIndex
                ? "w-5 bg-cyan-400"
                : "w-1.5 bg-gray-700"
            }`}
          />
        ))}

      </div>
    )}

  </div>
)}

      {/* ── Choose your battle ──────────────────────────────────── */}
      <div className="px-4 mb-6">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
          // Choose Your Battle
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {/* BGMI card */}
          <button
            onClick={() => onNavigate("battles", "bgmi")}
            className="text-left group"
          >
            {/* Header above the banner — game identity */}
            <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
              <span className="text-sm">{GAME_LABELS.bgmi.icon}</span>
              <span className="text-[11px] font-black uppercase tracking-wide text-cyan-300">
                {GAME_LABELS.bgmi.name}
              </span>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-cyan-800/60 group-hover:border-cyan-500 transition h-32">
              <div
                className="absolute inset-0 bg-cover bg-center scale-105 group-hover:scale-100 transition-transform duration-500"
                style={{ backgroundImage: `url(${GAME_BACKGROUNDS.bgmi})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f17] via-[#0b0f17]/70 to-[#0b0f17]/10" />
              <div className="relative z-10 p-3 h-full flex flex-col justify-end">
                <p className="text-lg font-black text-white leading-none">
                  {liveGameCounts.bgmi} <span className="text-[10px] font-bold text-gray-300 uppercase">Live Now</span>
                </p>
                <span className="text-[10px] font-bold text-cyan-300 mt-1">Play Now →</span>
              </div>
            </div>
          </button>

          {/* Free Fire card */}
          <button
            onClick={() => onNavigate("battles", "ff")}
            className="text-left group"
          >
            {/* Header above the banner — game identity */}
            <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
              <span className="text-sm">{GAME_LABELS.ff.icon}</span>
              <span className="text-[11px] font-black uppercase tracking-wide text-orange-300">
                {GAME_LABELS.ff.name}
              </span>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-orange-800/60 group-hover:border-orange-500 transition h-32">
              <div
                className="absolute inset-0 bg-cover bg-center scale-105 group-hover:scale-100 transition-transform duration-500"
                style={{ backgroundImage: `url(${GAME_BACKGROUNDS.ff})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f17] via-[#0b0f17]/70 to-[#0b0f17]/10" />
              <div className="relative z-10 p-3 h-full flex flex-col justify-end">
                <p className="text-lg font-black text-white leading-none">
                  {liveGameCounts.ff} <span className="text-[10px] font-bold text-gray-300 uppercase">Live Now</span>
                </p>
                <span className="text-[10px] font-bold text-orange-300 mt-1">Play Now →</span>
              </div>
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