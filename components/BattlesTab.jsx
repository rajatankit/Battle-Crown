"use client";

import { useState, useEffect, useMemo } from "react";
import BottomNav from "./BottomNav";
import MatchCountdown from "./MatchCountdown";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "soon", label: "Starting Soon" },
  { key: "completed", label: "Completed" },
];

function TournamentCard({ tournament, variant = "soon", onJoin }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const gameName = (tournament.game || tournament.gameType || tournament.title || "").toLowerCase();
  const isFreeFire = gameName.includes("free") || gameName.includes("ff");
  const maxSlots = tournament.maxSlots || (isFreeFire ? 50 : 100);
  const displayMode = tournament.mode || (isFreeFire ? "Clash Squad / BR" : "Squad / Solo");
  const joinedCount = tournament.joinedCount || tournament.joined_players_count || 0;
  const isFull = joinedCount >= maxSlots;

  useEffect(() => {
    if (!tournament.slides?.length) return;
    const t = setInterval(() => setCurrentSlide((p) => (p + 1) % tournament.slides.length), 3500);
    return () => clearInterval(t);
  }, [tournament.slides?.length]);

  if (variant === "completed") {
    return (
      <div className="flex items-center gap-3 bg-[#0f141c]/90 border border-gray-800 rounded-lg p-2.5">
        {tournament.slides?.[0] && (
          <img src={tournament.slides[0]} alt="" className="w-14 h-14 rounded object-cover flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate">
            {(tournament.game || "MATCH").toUpperCase()} • {tournament.map}
          </p>
          <p className="text-[10px] text-gray-400">
            ₹{tournament.entryFee} Entry {tournament.rank ? `• Rank #${tournament.rank}` : ""}
          </p>
        </div>
        <button className="bg-[#161d2b] hover:bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] font-black uppercase px-3 py-1.5 rounded flex-shrink-0">
          View
        </button>
      </div>
    );
  }

  return (
    <div className="bg-black/60 border border-gray-800 hover:border-gray-700 transition-all rounded-lg overflow-hidden flex flex-col shadow-xl">
      <div className="relative h-40 w-full bg-black overflow-hidden">
        {tournament.slides?.[currentSlide] ? (
          <img
            src={tournament.slides[currentSlide]}
            alt={tournament.title}
            className="w-full h-full object-cover filter saturate-125 transition-all duration-700"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#0e2233] to-[#0b0f17]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f17] via-transparent to-black/40" />
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className={`text-[10px] font-mono px-2 py-0.5 border uppercase font-bold ${isFreeFire ? "bg-orange-950 text-orange-400 border-orange-800" : "bg-black/85 text-cyan-400 border-cyan-800"}`}>
            {isFreeFire ? "🔥 FREE FIRE" : "🛡️ BGMI"}
          </span>
          {variant === "live" && (
            <span className="text-[10px] font-mono px-2 py-0.5 border uppercase font-bold bg-red-600 text-white border-red-500 animate-pulse">
              LIVE
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2">
          <span className="text-xs font-bold px-3 py-1.5 bg-black/90 border border-yellow-500/50 text-yellow-400 rounded-md shadow-lg backdrop-blur-sm">
            {joinedCount} / {maxSlots}
          </span>
        </div>
        <div className="absolute bottom-2 left-3 right-3">
          <h3 className="font-black tracking-wide uppercase text-sm text-white">{tournament.title}</h3>
          <p className="text-[11px] text-gray-300 font-mono">
            Map: <span className="text-cyan-300 font-bold">{tournament.map}</span>
          </p>
          {variant === "soon" && (
            <div className="mt-1.5">
              <MatchCountdown matchTime={tournament.date} />
            </div>
          )}
        </div>
      </div>
      <div className="p-3.5 bg-[#0f141c]/90 flex items-center justify-between border-t border-gray-900">
        <div>
          <span className="text-[10px] text-gray-400 font-mono uppercase block">MODE</span>
          <span className="text-xs font-mono font-bold text-yellow-400">{displayMode}</span>
        </div>
        <div>
          <span className="text-[10px] text-gray-400 font-mono uppercase block">ENTRY FEE</span>
          <span className="text-xs font-mono font-bold text-green-400">₹{tournament.entryFee}</span>
        </div>
        <button
          onClick={() => onJoin(tournament)}
          disabled={isFull}
          className={`px-4 py-2 font-black text-xs uppercase tracking-wider transition-all shadow-lg ${
            isFull
              ? "bg-gray-700 text-gray-400 cursor-not-allowed"
              : isFreeFire
                ? "bg-orange-500 text-black hover:bg-orange-400 cursor-pointer"
                : "bg-cyan-400 text-black hover:bg-cyan-300 cursor-pointer"
          }`}
        >
          {isFull ? "Full" : "Join"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BattlesTab — mobile "Battles" screen: game switch (BGMI / Free Fire),
// status filter chips, and live / starting-soon / completed sections.
//
// Props:
//   tournaments        array — full live tournament list from Firestore
//   selectedGameTab     "bgmi" | "ff"
//   setSelectedGameTab  function
//   onJoin(tournament)  function — opens the join flow (rules modal etc.)
//   onNavigate(tab)     function — bottom nav
//   activeTab           string — current bottom-nav tab ("battles" here)
// ─────────────────────────────────────────────────────────────────────────
export default function BattlesTab({
  tournaments = [],
  selectedGameTab = "bgmi",
  setSelectedGameTab = () => {},
  onJoin = () => {},
  onNavigate = () => {},
  activeTab = "battles",
  onMatchHistoryClick = () => {},
}) {
  const [statusFilter, setStatusFilter] = useState("all");

  const gameFiltered = useMemo(
    () =>
      tournaments.filter((t) => {
        const name = (t.game || t.gameType || "").toLowerCase();
        return selectedGameTab === "ff"
          ? name.includes("free") || name.includes("ff")
          : name.includes("bgmi") || (!name.includes("free") && !name.includes("ff"));
      }),
    [tournaments, selectedGameTab]
  );

  const live = gameFiltered.filter((t) => t.status === "live");
  const soon = gameFiltered.filter((t) => t.status !== "live" && t.status !== "completed");
  const completed = gameFiltered.filter((t) => t.status === "completed");

  const showLive = statusFilter === "all" || statusFilter === "live";
  const showSoon = statusFilter === "all" || statusFilter === "soon";
  const showCompleted = statusFilter === "all" || statusFilter === "completed";

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white font-mono pb-24">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
  <img
    src="/crown-logo.png"
    alt="Battle Crown"
    className="w-8 h-8 object-contain"
  />

  <span className="text-lg font-black italic tracking-tight">
    BATTLE <span className="text-cyan-400">CROWN</span>
  </span>
</div>
      </header>

      {/* ── Game switch — segmented control with per-side shading ───────── */}
      <div className="px-4">
        <div className="relative flex rounded-xl border border-gray-800 bg-[#0d1219] overflow-hidden shadow-inner">
          {/* center divider */}
          <div className="absolute left-1/2 top-2.5 bottom-2.5 w-px bg-gray-800 z-10" />

          <button
            onClick={() => setSelectedGameTab("bgmi")}
            className={`relative flex-1 py-3 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wide transition-all duration-300 ${
              selectedGameTab === "bgmi"
                ? "bg-gradient-to-r from-cyan-500/25 via-cyan-500/10 to-transparent text-cyan-300"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className="text-sm">🛡️</span> BGMI
            {selectedGameTab === "bgmi" && (
              <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-cyan-400 rounded-full shadow-[0_0_10px_2px_rgba(34,211,238,0.65)]" />
            )}
          </button>

          <button
            onClick={() => setSelectedGameTab("ff")}
            className={`relative flex-1 py-3 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wide transition-all duration-300 ${
              selectedGameTab === "ff"
                ? "bg-gradient-to-l from-orange-500/25 via-orange-500/10 to-transparent text-orange-300"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className="text-sm">🔥</span> Free Fire
            {selectedGameTab === "ff" && (
              <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-orange-400 rounded-full shadow-[0_0_10px_2px_rgba(251,146,60,0.65)]" />
            )}
          </button>
        </div>
      </div>

    {/* Status filter chips */}
      <div className="px-4 mt-3 mb-1 flex items-center justify-between gap-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-colors ${
                statusFilter === f.key
                  ? "bg-cyan-400 text-black border-cyan-400"
                  : "bg-[#161d2b] text-gray-400 border-gray-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={onMatchHistoryClick}
          title="Match History"
          className="w-9 h-9 flex-shrink-0 bg-[#111824]/90 border border-gray-600/40 text-gray-300 rounded-lg flex items-center justify-center hover:border-gray-400 hover:bg-black/60 transition-all"
        >
          📋
        </button>
      </div>

      {/* Live tournaments */}
      {showLive && (
        <section className="px-4 mt-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
              🔴 Live Tournaments
            </h2>
          </div>
          {live.length === 0 ? (
            <p className="text-[11px] text-gray-500 italic py-2">No live matches right now.</p>
          ) : (
            <div className="space-y-4">
              {live.map((t) => (
                <TournamentCard key={t.id} tournament={t} variant="live" onJoin={onJoin} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Starting soon */}
      {showSoon && (
        <section className="px-4 mt-6">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
            // Starting Soon
          </h2>
          {soon.length === 0 ? (
            <p className="text-[11px] text-gray-500 italic py-2">No upcoming matches — check back soon.</p>
          ) : (
            <div className="space-y-4">
              {soon.map((t) => (
                <TournamentCard key={t.id} tournament={t} variant="soon" onJoin={onJoin} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Completed */}
      {showCompleted && (
        <section className="px-4 mt-6">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
            // Completed Matches
          </h2>
          {completed.length === 0 ? (
            <p className="text-[11px] text-gray-500 italic py-2">No completed matches yet.</p>
          ) : (
            <div className="space-y-2">
              {completed.map((t) => (
                <TournamentCard key={t.id} tournament={t} variant="completed" onJoin={onJoin} />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="h-6" />
      <BottomNav activeTab={activeTab} onNavigate={onNavigate} />
    </div>
  );
}