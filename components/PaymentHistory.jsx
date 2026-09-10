"use client";

import { useState, useEffect, useCallback } from "react";

const MIN_WITHDRAW = 100;

// ─────────────────────────────────────────────────────────────────────────
// PaymentHistory — replaces the old GamingWallet component.
//
// No deposit wallet, no winnings wallet, no crowns, no redeem flow.
// Shows:
//   1. Entry payment history (money the player actually paid, per tournament)
//   2. Pending tournament rewards (verified match wins awaiting payout) with
//      a per-reward Withdraw button — each reward can only be withdrawn once
//      (enforced server-side via the @unique tournamentRewardId constraint).
//
// BACKEND NOTE: this expects two endpoints that don't exist in what you
// showed me yet — you'll need to add them (both scoped to the authenticated
// user via the Firebase token, same pattern as /api/user/register):
//   GET  /api/user/entry-payments   -> { success, payments: EntryPayment[] }
//   GET  /api/user/rewards          -> { success, rewards: TournamentReward[] }
//   POST /api/wallet/withdraw-reward -> body { tournamentRewardId, upiId }
// ─────────────────────────────────────────────────────────────────────────
export default function PaymentHistory({ userEmail, getIdToken = async () => null }) {
  const [payments, setPayments] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [loadingRewards, setLoadingRewards] = useState(true);

  const [withdrawTarget, setWithdrawTarget] = useState(null); // the reward being withdrawn
  const [upiId, setUpiId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const fetchPayments = useCallback(async () => {
    if (!userEmail) return;
    try {
      setLoadingPayments(true);
      const token = await getIdToken();
      const res = await fetch(`/api/user/entry-payments?email=${encodeURIComponent(userEmail)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) setPayments(data.payments || []);
    } catch (err) {
      console.error("Entry payments fetch error:", err);
    } finally {
      setLoadingPayments(false);
    }
  }, [userEmail, getIdToken]);

  const fetchRewards = useCallback(async () => {
    if (!userEmail) return;
    try {
      setLoadingRewards(true);
      const token = await getIdToken();
     const res = await fetch(`/api/user/rewards?email=${encodeURIComponent(userEmail)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) setRewards(data.rewards || []);
    } catch (err) {
      console.error("Rewards fetch error:", err);
    } finally {
      setLoadingRewards(false);
    }
  }, [userEmail, getIdToken]);

  useEffect(() => {
    fetchPayments();
    fetchRewards();
  }, [fetchPayments, fetchRewards]);

  const pendingRewards = rewards.filter((r) => r.status === "PENDING_PAYOUT");
  const pendingTotal = pendingRewards.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const openWithdraw = (reward) => {
    if (Number(reward.amount) < MIN_WITHDRAW) {
      setMessage(`⚠️ Minimum withdrawal amount is ₹${MIN_WITHDRAW}`);
      setTimeout(() => setMessage(""), 4000);
      return;
    }
    setWithdrawTarget(reward);
    setUpiId("");
  };

  const submitWithdraw = async () => {
    if (!withdrawTarget) return;
    if (!upiId || upiId.trim().length < 5) {
      setMessage("⚠️ Please enter a valid UPI ID!");
      return;
    }
    try {
      setSubmitting(true);
      const token = await getIdToken();
      const res = await fetch(`/api/rewards/${withdrawTarget.id}/payout`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify({
    upiId: upiId.trim(),
    email: userEmail,
  }),
});
      const data = await res.json();
      if (data.success) {
        setMessage("✅ Withdrawal request submitted! Admin will verify and pay within 24 hours.");
        setWithdrawTarget(null);
        fetchRewards();
      } else {
        setMessage(`❌ ${data.error || "Withdrawal request failed"}`);
      }
    } catch (err) {
      console.error("Withdraw error:", err);
      setMessage("❌ Network error. Please try again.");
    } finally {
      setSubmitting(false);
      setTimeout(() => setMessage(""), 8000);
    }
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-gray-800/80 bg-[#080d14]/95 shadow-2xl h-full">
        <div className="absolute -top-32 -right-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-cyan-500 to-transparent" />

        <div className="relative p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div>
              <p className="text-[9px] text-cyan-500/80 font-mono tracking-[0.22em] uppercase mb-1">// Player Financial Hub</p>
              <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">Payment History</h3>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/30 border border-cyan-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[9px] text-cyan-300 font-mono uppercase tracking-wider">Direct Pay</span>
            </div>
          </div>

          {/* Pending rewards summary */}
          <div className="group relative overflow-hidden rounded-xl border border-emerald-500/30 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-emerald-950/70 border border-emerald-500/40 flex items-center justify-center">
                  <span className="text-lg">🏆</span>
                </div>
                <div>
                  <p className="text-sm text-emerald-400 uppercase font-black tracking-wider">Pending Rewards</p>
                  <p className="text-[10px] text-gray-400 font-mono">Verified match wins awaiting payout</p>
                </div>
              </div>
              <span className="text-lg font-black text-emerald-400">₹{pendingTotal}</span>
            </div>

            {loadingRewards ? (
              <p className="text-[10px] text-gray-500 font-mono text-center py-3">Loading rewards...</p>
            ) : pendingRewards.length === 0 ? (
              <p className="text-[10px] text-gray-500 font-mono text-center py-3">No pending rewards right now.</p>
            ) : (
              <div className="space-y-2 mt-2">
                {pendingRewards.map((r) => (
                  <div key={r.id} className="flex items-center justify-between bg-black/40 border border-gray-800 rounded-lg p-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{r.reason}</p>
                      <p className="text-[9px] text-gray-500">{r.tournament?.title || "Tournament"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-emerald-400 font-black text-sm">₹{r.amount}</span>
                      <button
                        onClick={() => openWithdraw(r)}
                        className="bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[9px] uppercase px-2.5 py-1.5 rounded"
                      >
                        Withdraw
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {message && (
            <div className="mb-4 text-[9px] text-center font-mono text-yellow-300 bg-yellow-950/20 border border-yellow-800/50 rounded-lg p-2.5">
              {message}
            </div>
          )}

          {/* Entry payment history — ab har payment ke saath uska reward status bhi dikhega */}
<div className="rounded-xl border border-gray-800/80 bg-black/30 overflow-hidden">
  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/80">
    <div>
      <p className="text-[9px] text-cyan-500/80 font-mono tracking-[0.18em] uppercase">// Entry Payments</p>
      <h4 className="text-sm font-black text-white uppercase tracking-wider mt-0.5">What You've Paid</h4>
    </div>
    <span className="text-[8px] text-gray-500 font-mono uppercase">{payments.length} Records</span>
  </div>

  <div className="max-h-[320px] overflow-y-auto">
    {loadingPayments ? (
      <div className="p-6 text-center">
        <div className="inline-block w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-[9px] text-gray-500 font-mono mt-2">Loading payments...</p>
      </div>
    ) : payments.length === 0 ? (
      <div className="p-8 text-center">
        <div className="mx-auto w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-3">💳</div>
        <p className="text-xs text-gray-400 font-bold">No Payments Yet</p>
        <p className="text-[9px] text-gray-600 font-mono mt-1">Tournament entry payments will appear here.</p>
      </div>
    ) : (
      <div className="divide-y divide-gray-800/60">
        {payments.map((p) => {
          const date = p.createdAt
            ? new Date(p.createdAt).toLocaleString("en-IN", {
                day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
              })
            : "";

          // Is tournament ke liye reward status dhoondo (agar koi hai)
          const matchedReward = rewards.find((r) => r.tournamentId === p.tournamentId);

          let rewardBadge = null;
          if (matchedReward) {
            if (matchedReward.status === "PAID") {
              rewardBadge = (
                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                  ✓ Reward Paid ₹{matchedReward.amount}
                </span>
              );
            } else {
              rewardBadge = (
                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-yellow-950/60 text-yellow-400 border border-yellow-800/60">
                  ⏳ Reward Pending ₹{matchedReward.amount}
                </span>
              );
            }
          } else {
            rewardBadge = (
              <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-gray-900/60 text-gray-500 border border-gray-800/60">
                No Reward Yet
              </span>
            );
          }

          return (
            <div key={p.id} className="px-4 py-3 hover:bg-white/[0.02] transition">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 shrink-0 rounded-lg border flex items-center justify-center bg-red-950/30 border-red-800/50">
                  <span className="text-sm">↘</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-white font-bold truncate">
                    {p.tournament?.title || p.description || "Tournament Entry Fee"}
                  </p>
                  <p className="text-[8px] text-gray-600 font-mono mt-0.5">{date}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black text-red-400">-₹{Number(p.amount || 0)}</p>
                  <p className="text-[7px] text-gray-600 uppercase font-mono mt-0.5">{p.status}</p>
                </div>
              </div>
              <div className="mt-2 ml-12">{rewardBadge}</div>
            </div>
          );
        })}
      </div>
    )}
  </div>
</div>

          <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[8px] text-gray-600 font-mono uppercase tracking-wider">
            <span>🔒 Direct Payment</span>
            <span className="hidden sm:block">•</span>
            <span>No Stored Balance</span>
            <span className="hidden sm:block">•</span>
            <span>Battle Crown</span>
          </div>
        </div>
      </div>

      {/* Withdraw modal — per-reward, since each reward can only be withdrawn once */}
      {withdrawTarget && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-emerald-500/50 bg-[#0b111a] shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-transparent" />
            <div className="p-6">
              <button onClick={() => setWithdrawTarget(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition text-lg">✕</button>
              <div className="text-center mb-6">
                <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-700/50 flex items-center justify-center mb-3">💸</div>
                <h4 className="text-base font-black text-emerald-400 uppercase tracking-wider">Withdraw Reward</h4>
                <p className="text-[10px] text-gray-500 font-mono mt-1">{withdrawTarget.reason}</p>
              </div>
              <div className="rounded-xl bg-emerald-950/20 border border-emerald-800/50 p-4 text-center mb-4">
                <p className="text-[8px] text-gray-500 uppercase font-mono">Amount</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">₹{withdrawTarget.amount}</p>
              </div>
              <div>
                <label className="text-[9px] text-gray-500 uppercase font-bold tracking-wider block mb-1.5">UPI ID</label>
                <input
                  type="text"
                  placeholder="yourname@upi"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="w-full p-3 bg-black/70 border border-gray-700 rounded-lg text-white text-sm font-bold outline-none focus:border-emerald-400 transition"
                />
              </div>
              <button
                onClick={submitWithdraw}
                disabled={submitting}
                className="w-full mt-5 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-wider transition disabled:opacity-50"
              >
                {submitting ? "Submitting Request..." : "Submit Withdrawal Request →"}
              </button>
              <p className="text-[8px] text-gray-600 text-center font-mono mt-4 leading-relaxed">
                Withdrawal requests are manually verified by Battle Crown Admin.<br />Processing may take up to 24 hours.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}