"use client";

// components/organizer/CancelTournamentButton.jsx
//
// "Pakka cancel karein?" is the primary (highlighted) action, same
// safety pattern as the crown-spend dialog — the destructive/confirm
// action is deliberate, not a stray tap.

import { useState } from "react";

export default function CancelTournamentButton({ tournamentId, onCancelled }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setConfirming(false);
        onCancelled?.(data.tournament);
      } else {
        setError(data.message || "Could not cancel");
      }
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="rounded-lg px-3 py-2 text-sm font-medium bg-[#2A1414] text-[#E5615B] border border-[#4A1D1D] hover:bg-[#331818]"
      >
        Cancel tournament
      </button>

      {confirming && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-sm rounded-xl border border-[#4A1D1D] bg-[#171A21] p-5">
            <p className="text-sm font-medium text-[#F4F5F7]">
              Tournament cancel karne pe aapke spent crowns wapas nahi milenge. Players ko notify
              hoga.
            </p>
            <p className="text-sm text-[#8A8F9C] mt-2">Pakka cancel karein?</p>

            {error && <p className="text-xs text-[#E5615B] mt-2">{error}</p>}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg py-2 text-sm font-medium bg-[#262A33] text-[#C3C7D1] hover:bg-[#31363F]"
              >
                Wapas
              </button>
              <button
                onClick={handleConfirm}
                disabled={cancelling}
                className="flex-1 rounded-lg py-2 text-sm font-medium bg-[#E5615B] text-[#171208]
                  disabled:opacity-40 hover:bg-[#EE746E]"
              >
                {cancelling ? "Cancelling..." : "Pakka cancel karein"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}