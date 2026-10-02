"use client";

// components/organizer/OrganizeFlow.jsx
//
// Free users never reach this component — gate them to /pricing
// before rendering it. Fetches GET /api/user/organizer-status to
// know which path(s) are available, then POSTs to
// /api/tournaments/organize. The crown path always shows an
// explicit no-refund warning before spending, and "Spend crowns"
// is the primary (right-hand, highlighted) button so an accidental
// tap lands on "Cancel" instead.

import { useEffect, useState } from "react";

export default function OrganizeFlow() {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ title: "", game: "", map: "", mode: "", maxSlots: 50 });
  const [path, setPath] = useState(null); // "subscription" | "crowns"
  const [confirmingCrownSpend, setConfirmingCrownSpend] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch("/api/user/organizer-status")
      .then((r) => r.json())
      .then((d) => d.success && setStatus(d));
  }, []);

  if (!status) return <p className="text-[#8A8F9C] text-sm">Loading...</p>;

  const canSubscription = status.canOrganizeViaSubscription && status.remainingThisMonth !== 0;
  const canCrowns = status.canOrganizeViaCrowns && status.crownBalance >= status.crownOrganizeCost;

  function handlePathPick(p) {
    if (p === "crowns") {
      setConfirmingCrownSpend(true);
    } else {
      setPath(p);
    }
  }

  async function submitOrganize(chosenPath) {
    setSubmitting(true);
    setConfirmingCrownSpend(false);
    setPath(chosenPath);
    try {
      const res = await fetch("/api/tournaments/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: chosenPath, ...form }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.success) {
    return (
      <div className="rounded-xl border border-[#1D4A3B] bg-[#10231D] p-6 text-center">
        <p className="text-[#3FB88F] font-medium">Tournament created</p>
        <p className="text-sm text-[#8A8F9C] mt-1">{result.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-md">
      <div className="flex flex-col gap-3">
        <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        <Field label="Game" value={form.game} onChange={(v) => setForm({ ...form, game: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Map" value={form.map} onChange={(v) => setForm({ ...form, map: v })} />
          <Field label="Mode" value={form.mode} onChange={(v) => setForm({ ...form, mode: v })} />
        </div>
        <Field
          label="Max slots"
          type="number"
          value={form.maxSlots}
          onChange={(v) => setForm({ ...form, maxSlots: Number(v) })}
        />
      </div>

      {result && !result.success && (
        <p className="text-sm text-[#E5615B]">{result.message}</p>
      )}

      <div className="flex flex-col gap-2">
        <button
          disabled={!canSubscription || submitting}
          onClick={() => submitOrganize("subscription")}
          className="w-full rounded-lg py-2.5 text-sm font-medium bg-[#262A33] text-[#F4F5F7]
            disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#31363F]"
        >
          {canSubscription
            ? `Use subscription (${status.remainingThisMonth} left this month)`
            : "Subscription limit used"}
        </button>

        <button
          disabled={!status.canOrganizeViaCrowns || submitting}
          onClick={() => handlePathPick("crowns")}
          className="w-full rounded-lg py-2.5 text-sm font-medium bg-[#E8B04B] text-[#171208]
            disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F2BE63]"
        >
          {status.canOrganizeViaCrowns
            ? `Spend ${status.crownOrganizeCost} 👑 to organize`
            : "Crown-organize not on your plan"}
        </button>
      </div>

      {confirmingCrownSpend && (
        <CrownSpendWarningDialog
          cost={status.crownOrganizeCost}
          balance={status.crownBalance}
          onConfirm={() => submitOrganize("crowns")}
          onCancel={() => setConfirmingCrownSpend(false)}
        />
      )}
    </div>
  );
}

function CrownSpendWarningDialog({ cost, balance, onConfirm, onCancel }) {
  const insufficient = balance < cost;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-[#3D2F14] bg-[#171A21] p-5">
        <p className="text-sm font-medium text-[#F4F5F7]">
          ⚠️ Ek baar spend karne ke baad cancel karne pe crowns wapas NAHI milenge.
        </p>
        <p className="text-sm text-[#8A8F9C] mt-2">Confirm karein?</p>
        <p className="text-xs text-[#5B6070] mt-3">
          Balance: 👑 {balance} · Cost: 👑 {cost}
        </p>

        {insufficient && (
          <p className="text-xs text-[#E5615B] mt-2">Not enough crowns for this.</p>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg py-2 text-sm font-medium bg-[#262A33] text-[#C3C7D1] hover:bg-[#31363F]"
          >
            Wapas
          </button>
          <button
            onClick={onConfirm}
            disabled={insufficient}
            className="flex-1 rounded-lg py-2 text-sm font-medium bg-[#E8B04B] text-[#171208]
              disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F2BE63]"
          >
            {cost} 👑 Spend karo
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-[#8A8F9C]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg bg-[#0F1115] border border-[#262A33] px-3 py-2 text-sm text-[#F4F5F7]
          outline-none focus:border-[#E8B04B]"
      />
    </label>
  );
}