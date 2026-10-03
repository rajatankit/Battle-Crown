"use client";

// components/tournament/TournamentCard.jsx
//
// FIX: dashboard/page.jsx's Firestore listener converts the `date` field
// (Firestore Timestamp -> ISO string) but this card was reading
// `startTime`, which the listener never sets — so the time always
// showed blank/invalid. Now reads `date` to match.

export default function TournamentCard({ tournament, onJoin, joining }) {
  const {
    title,
    game,
    map,
    mode,
    maxSlots,
    joinedCount,
    status,
    firstPrizeCrowns,
    secondPrizeCrowns,
    thirdPrizeCrowns,
    killRewardCrowns,
    joinRewardCrowns,
    date, // ← was startTime
  } = tournament;

  const slotsLeft = Math.max(0, maxSlots - joinedCount);
  const isFull = slotsLeft === 0;
  const isJoinable = status === "upcoming" && !isFull;

  return (
    <div className="rounded-xl border border-[#262A33] bg-[#171A21] p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold text-[#F4F5F7] leading-snug">{title}</h3>
          <p className="text-sm text-[#8A8F9C] mt-0.5">
            {game}
            {map ? ` · ${map}` : ""}
            {mode ? ` · ${mode}` : ""}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="flex flex-wrap gap-2">
        {firstPrizeCrowns > 0 && <CrownChip label="1st" amount={firstPrizeCrowns} />}
        {secondPrizeCrowns > 0 && <CrownChip label="2nd" amount={secondPrizeCrowns} />}
        {thirdPrizeCrowns > 0 && <CrownChip label="3rd" amount={thirdPrizeCrowns} />}
        {killRewardCrowns > 0 && <CrownChip label="/kill" amount={killRewardCrowns} />}
      </div>

      <div className="flex items-center justify-between text-sm text-[#8A8F9C]">
        <span>
          {joinedCount}/{maxSlots} slots
        </span>
        {date && <span>{new Date(date).toLocaleString()}</span>}
      </div>

      <button
        onClick={() => onJoin(tournament.id)}
        disabled={!isJoinable || joining}
        className="w-full rounded-lg py-2.5 font-medium text-sm transition-colors
          disabled:bg-[#262A33] disabled:text-[#5B6070] disabled:cursor-not-allowed
          bg-[#E8B04B] text-[#171208] hover:bg-[#F2BE63]"
      >
        {isFull
          ? "Tournament full"
          : status !== "upcoming"
          ? "Registration closed"
          : joining
          ? "Joining..."
          : `Join · +${joinRewardCrowns} 👑`}
      </button>
    </div>
  );
}

function CrownChip({ label, amount }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#241D0F] border border-[#3D2F14] px-2.5 py-1 text-xs font-medium text-[#E8B04B]">
      {label} · 👑 {amount}
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    upcoming: { label: "Upcoming", cls: "bg-[#10231D] text-[#3FB88F] border-[#1D4A3B]" },
    live: { label: "Live", cls: "bg-[#2A1414] text-[#E5615B] border-[#4A1D1D] animate-pulse" },
    completed: { label: "Completed", cls: "bg-[#1B1E26] text-[#8A8F9C] border-[#262A33]" },
    cancelled: { label: "Cancelled", cls: "bg-[#1B1E26] text-[#8A8F9C] border-[#262A33]" },
    registration_closed: { label: "Closed", cls: "bg-[#1B1E26] text-[#8A8F9C] border-[#262A33]" },
  };
  const s = map[status] || map.upcoming;
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}