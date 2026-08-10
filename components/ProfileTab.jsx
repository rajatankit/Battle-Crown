"use client";

import BottomNav from "./BottomNav";

// ─────────────────────────────────────────────────────────────────────────
// ProfileTab — mobile "Profile" screen. Purely presentational; all state
// (edit mode, temp values, save handlers) lives in dashboard/page.js and is
// passed down, same pattern as HomeTab.
// ─────────────────────────────────────────────────────────────────────────
export default function ProfileTab({
  displayName = "Player",
  playerLevel = 1,
  currentTier,
  bgmiIgn,
  bgmiUid,
  ffIgn,
  ffUid,
  isEditingProfile,
  setIsEditingProfile,
  tempBgmiIgn,
  setTempBgmiIgn,
  tempBgmiUid,
  setTempBgmiUid,
  tempFfIgn,
  setTempFfIgn,
  tempFfUid,
  setTempFfUid,
  onSaveProfile,
  bio,
  isEditingBio,
  tempBio,
  setTempBio,
  bioError,
  onEditBio,
  onSaveBio,
  unlockedBadges = [],
  totalBadges = 0,
  matchesTowardNext = 0,
  matchesNeededForNext = 1,
  protectionPoints = 5,
  onXpInfoClick,
  onInactivityInfoClick,
  xpModalMessage,
  inactivityModalMessage,
  onOpenLevelModal,
  onNavigate = () => {},
  activeTab = "profile",
}) {
  const progressPct = Math.min((matchesTowardNext / Math.max(matchesNeededForNext, 1)) * 100, 100);

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white font-mono pb-24">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <span className="text-lg font-black italic tracking-tight">
          BATTLE <span className="text-cyan-400">CROWN</span>
        </span>
      </header>

      <div className="px-4 space-y-4">
        {/* Header card */}
        <div className="flex items-center justify-between bg-[#0f141c]/90 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-yellow-500 flex items-center justify-center text-xl font-black text-black flex-shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{displayName}</p>
              <p className="text-[10px] text-yellow-400 font-bold">
                {currentTier?.name} {currentTier?.badge}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[9px] text-cyan-500 uppercase block font-black tracking-widest">Level</span>
            <span className="text-xl font-black text-cyan-300 leading-none block">{playerLevel}</span>
          </div>
        </div>

        <button
          onClick={() =>
            isEditingProfile
              ? onSaveProfile()
              : setIsEditingProfile(true)
          }
          className="w-full py-2.5 rounded-lg border border-cyan-500/30 bg-cyan-950/30 text-cyan-300 text-[10px] uppercase font-black tracking-wide"
        >
          {isEditingProfile ? "Save Profile ✓" : "Edit Profile ✍️"}
        </button>

        {/* BGMI Profile */}
        <div className="rounded-xl border border-gray-800/80 bg-black/35 overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-cyan-950/20 border-b border-gray-800/70">
            <span className="text-[10px] font-black text-cyan-400 tracking-wider">🛡️ BGMI PROFILE</span>
          </div>
          <div className="p-3.5 space-y-3">
            <div className="flex justify-between items-center gap-3 text-xs">
              <span className="text-gray-500 uppercase text-[9px] font-bold">IGN</span>
              {isEditingProfile ? (
                <input
                  value={tempBgmiIgn}
                  onChange={(e) => setTempBgmiIgn(e.target.value)}
                  className="bg-black/80 border border-cyan-600/70 rounded px-2.5 py-1 text-xs text-white w-40 outline-none focus:border-cyan-400"
                />
              ) : (
                <span className="font-bold text-white truncate max-w-[160px]">{bgmiIgn}</span>
              )}
            </div>
            <div className="flex justify-between items-center gap-3 text-xs">
              <span className="text-gray-500 uppercase text-[9px] font-bold">UID</span>
              {isEditingProfile ? (
                <input
                  value={tempBgmiUid}
                  onChange={(e) => setTempBgmiUid(e.target.value)}
                  className="bg-black/80 border border-cyan-600/70 rounded px-2.5 py-1 text-xs text-cyan-300 w-40 outline-none focus:border-cyan-400"
                />
              ) : (
                <span className="font-bold text-cyan-300 font-mono">{bgmiUid}</span>
              )}
            </div>
          </div>
        </div>

        {/* Free Fire Profile */}
        <div className="rounded-xl border border-gray-800/80 bg-black/35 overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-orange-950/15 border-b border-gray-800/70">
            <span className="text-[10px] font-black text-orange-400 tracking-wider">🔥 FREE FIRE PROFILE</span>
          </div>
          <div className="p-3.5 space-y-3">
            <div className="flex justify-between items-center gap-3 text-xs">
              <span className="text-gray-500 uppercase text-[9px] font-bold">IGN</span>
              {isEditingProfile ? (
                <input
                  value={tempFfIgn}
                  onChange={(e) => setTempFfIgn(e.target.value)}
                  className="bg-black/80 border border-orange-600/70 rounded px-2.5 py-1 text-xs text-white w-40 outline-none focus:border-orange-400"
                />
              ) : (
                <span className="font-bold text-white truncate max-w-[160px]">{ffIgn}</span>
              )}
            </div>
            <div className="flex justify-between items-center gap-3 text-xs">
              <span className="text-gray-500 uppercase text-[9px] font-bold">UID</span>
              {isEditingProfile ? (
                <input
                  value={tempFfUid}
                  onChange={(e) => setTempFfUid(e.target.value)}
                  className="bg-black/80 border border-orange-600/70 rounded px-2.5 py-1 text-xs text-orange-300 w-40 outline-none focus:border-orange-400"
                />
              ) : (
                <span className="font-bold text-orange-300 font-mono">{ffUid}</span>
              )}
            </div>
          </div>
        </div>

        {/* Badges */}
        <div
          onClick={onOpenLevelModal}
          className="rounded-xl border border-yellow-800/40 bg-gradient-to-br from-yellow-950/15 via-black/40 to-yellow-950/10 p-3.5 cursor-pointer"
        >
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-black text-yellow-400 uppercase tracking-wider">🏆 Badges</span>
            <span className="text-[9px] text-gray-500 font-mono">{unlockedBadges.length} / {totalBadges} Earned</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unlockedBadges.length > 0 ? (
              unlockedBadges.map((b) => (
                <div
                  key={b.level}
                  title={`Unlocked at Level ${b.level}: ${b.name}`}
                  className="bg-black/70 border border-yellow-700/50 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs"
                >
                  <span>{b.badge}</span>
                  <span className="text-[10px] font-bold text-gray-200">{b.name}</span>
                </div>
              ))
            ) : (
              <span className="text-[10px] text-gray-600 italic">No badges unlocked yet.</span>
            )}
          </div>
        </div>

        {/* Social Bio */}
        <div className="rounded-xl border border-gray-800/80 bg-black/30 overflow-hidden">
          <div className="flex justify-between items-center px-3.5 py-2.5 border-b border-gray-800/70">
            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Social Bio</span>
            <button
              onClick={isEditingBio ? onSaveBio : onEditBio}
              className="text-[9px] text-cyan-400 font-black uppercase"
            >
              {isEditingBio ? "Save Bio ✓" : "Edit Bio"}
            </button>
          </div>
          <div className="p-3.5">
            {isEditingBio ? (
              <>
                <textarea
                  value={tempBio}
                  onChange={(e) => setTempBio(e.target.value)}
                  className="w-full bg-black/80 border border-cyan-600/60 rounded-lg p-2.5 text-xs text-white h-20 resize-none outline-none focus:border-cyan-400"
                />
                {bioError && <p className="text-[9px] text-red-500 font-bold mt-1.5">{bioError}</p>}
              </>
            ) : (
              <p className="text-[11px] text-gray-300 italic bg-black/30 p-3 rounded-lg border border-gray-900/80 leading-relaxed">
                "{bio || "No bio added yet."}"
              </p>
            )}
          </div>
        </div>

        {/* XP Progress */}
        <div className="rounded-xl border border-gray-800/80 bg-black/35 p-3.5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">XP Progress</span>
            <span className="text-[10px] text-cyan-300 font-bold">
              {matchesTowardNext} / {matchesNeededForNext} Matches
            </span>
          </div>
          <div className="w-full bg-gray-950 h-2.5 rounded-full overflow-hidden border border-gray-800">
            <div
              className="bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-[10px] text-cyan-400 font-bold">🛡️ Protection Points</span>
            <span className="text-[10px] font-black text-yellow-400">{protectionPoints}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={onXpInfoClick}
              className="py-2 rounded-lg bg-cyan-950/50 text-cyan-300 border border-cyan-800/70 text-[9px] uppercase font-black"
            >
              ℹ️ How XP Works
            </button>
            <button
              onClick={onInactivityInfoClick}
              className="py-2 rounded-lg bg-rose-950/40 text-rose-300 border border-rose-800/70 text-[9px] uppercase font-black"
            >
              🛡️ Protection Info
            </button>
          </div>
          {xpModalMessage && (
            <div className="text-[9px] text-cyan-300 bg-cyan-950/30 p-2.5 border border-cyan-800/60 rounded-lg italic">
              {xpModalMessage}
            </div>
          )}
          {inactivityModalMessage && (
            <div className="text-[9px] text-yellow-300 bg-yellow-950/30 p-2.5 border border-yellow-800/60 rounded-lg italic">
              {inactivityModalMessage}
            </div>
          )}
        </div>
      </div>

      <div className="h-6" />
      <BottomNav activeTab={activeTab} onNavigate={onNavigate} />
    </div>
  );
}