"use client";

// components/profile/ProfileDashboard.jsx
//
// Combines: crown balance chip, subscription plan badge, and the
// organizer dashboard (own tournaments + fill rate) into one profile
// section. Pulls from GET /api/user/subscription and
// GET /api/user/organized-tournaments.

import { useEffect, useState } from "react";
import CancelTournamentButton from "@/components/organizer/CancelTournamentButton";

export default function ProfileDashboard() {
  const [sub, setSub] = useState(null);
  const [tournaments, setTournaments] = useState(null);

  useEffect(() => {
    fetch("/api/user/subscription").then((r) => r.json()).then((d) => d.success && setSub(d));
    fetch("/api/user/organized-tournaments")
      .then((r) => r.json())
      .then((d) => d.success && setTournaments(d.tournaments));
  }, []);

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div className="flex items-center gap-3">
        <CrownBadge balance={sub?.crownBalance} />
        <PlanBadge plan={sub?.plan} />
      </div>

      <section>
        <h2 className="text-sm font-medium text-[#8A8F9C] mb-3">My organized tournaments</h2>
        {!tournaments && <p className="text-sm text-[#5B6070]">Loading...</p>}
        {tournaments?.length === 0 && (
          <p className="text-sm text-[#5B6070]">You haven't organized any tournaments yet.</p>
        )}
        <div className="flex flex-col gap-2">
          {tournaments?.map((t) => (
            <OrganizedTournamentRow
              key={t.id}
              tournament={t}
              onCancelled={(updated) =>
                setTournaments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function CrownBadge({ balance }) {
  return (
    <div className="rounded-full bg-[#241D0F] border border-[#3D2F14] px-4 py-1.5 flex items-center gap-1.5">
      <span className="text-[#E8B04B] font-semibold text-sm">👑 {balance ?? "..."}</span>
    </div>
  );
}

function PlanBadge({ plan }) {
  if (!plan) return null;
  const name = plan.name;
  const styles = {
    free: "bg-[#1B1E26] text-[#8A8F9C] border-[#262A33]",
    upgrade: "bg-[#141C2A] text-[#5B9BD5] border-[#1E3A5C]",
    pro: "bg-[#241D0F] text-[#E8B04B] border-[#3D2F14]",
    promax: "bg-[#2A1424] text-[#D168B5] border-[#4A1D3F]",
  };
  return (
    <span className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${styles[name] || styles.free}`}>
      {name === "free" ? "Free plan" : `${name} plan`}
    </span>
  );
}

function OrganizedTournamentRow({ tournament, onCancelled }) {
  const { id, title, status, joinedCount, maxSlots } = tournament;
  const cancellable = !["completed", "cancelled"].includes(status);

  return (
    <div className="flex items-center justify-between rounded-lg border border-[#262A33] bg-[#171A21] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-[#F4F5F7]">{title}</p>
        <p className="text-xs text-[#8A8F9C] mt-0.5">
          {joinedCount}/{maxSlots} slots filled · {status}
        </p>
      </div>
      {cancellable && <CancelTournamentButton tournamentId={id} onCancelled={onCancelled} />}
    </div>
  );
}