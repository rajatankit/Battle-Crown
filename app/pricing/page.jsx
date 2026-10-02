"use client";

// app/pricing/page.jsx
//
// Fetches GET /api/subscriptions/plans (public) and renders 4 cards.
// Founding-member banner is gated behind a config flag so it can be
// turned off once the first 500 users have signed up.
//
// Checkout requires auth — we send Firebase ID token in Authorization header.

import { useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav"; // apna path check karo
import { auth } from "@/app/lib/firebase"; // ← apna firebase path check karo (kabhi @/lib/firebase hota hai)

const FOUNDING_MEMBER_BANNER_ENABLED = true; // flip off once the promo ends

export default function PricingPage() {
  const [plans, setPlans] = useState(null);
  const [cycle, setCycle] = useState("monthly");
  const [error, setError] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null); // which plan is being processed

  useEffect(() => {
    fetch("/api/subscriptions/plans")
      .then((r) => r.json())
      .then((d) => (d.success ? setPlans(d.plans) : setError(d.message)))
      .catch(() => setError("Could not load plans"));
  }, []);

  async function handleChoose(planName) {
  if (planName === "free") return;

  const currentUser = auth.currentUser;
  if (!currentUser) {
    alert("Please login first to choose a plan.");
    return;
  }

  setLoadingPlan(planName);

  try {
    const token = await currentUser.getIdToken();

    const res = await fetch("/api/subscriptions/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: planName, billingCycle: cycle }),
    });

    const data = await res.json();
    console.log("Checkout response:", data); // debug ke liye

    if (!data.success || !data.payment_session_id) {
      alert(data.message || "Could not start checkout");
      return;
    }

    // Cashfree SDK checkout
    if (typeof window !== "undefined" && window.Cashfree) {
      const cashfree = new window.Cashfree({
        mode: "sandbox",
      });

      cashfree.checkout({
        paymentSessionId: data.payment_session_id,
        redirectTarget: "_self",
      });
    } else {
      alert("Payment SDK not loaded. Please refresh the page.");
    }
  } catch (err) {
    console.error("Checkout error:", err);
    alert("Something went wrong. Please try again.");
  } finally {
    setLoadingPlan(null);
  }
}

  return (
    <div className="min-h-screen bg-[#0F1115] px-4 py-14 pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-[#F4F5F7]">Choose your plan</h1>
          <p className="text-[#8A8F9C] mt-2">
            Play tournaments free forever. Upgrade to organize your own.
          </p>
        </div>

        {FOUNDING_MEMBER_BANNER_ENABLED && (
          <div className="mb-8 rounded-lg border border-[#3D2F14] bg-[#241D0F] px-4 py-3 text-center text-sm text-[#E8B04B]">
            Founding Member — 30% off your first year, limited to the first 500 users
          </div>
        )}

        <div className="flex justify-center mb-10">
          <div className="inline-flex rounded-full border border-[#262A33] bg-[#171A21] p-1">
            {["monthly", "annual"].map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  cycle === c ? "bg-[#E8B04B] text-[#171208]" : "text-[#8A8F9C]"
                }`}
              >
                {c === "monthly" ? "Monthly" : "Annual · save 2 months"}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-center text-[#E5615B]">{error}</p>}

        {plans && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.name}
                plan={plan}
                cycle={cycle}
                onChoose={handleChoose}
                loading={loadingPlan === plan.name}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanCard({ plan, cycle, onChoose, loading }) {
  const isFree = plan.name === "free";
  const priceRupees = isFree
    ? 0
    : (cycle === "monthly" ? plan.priceMonthlyPaisa : plan.priceAnnualPaisa) / 100;
  const perMonthEquivalent =
    !isFree && cycle === "annual" ? Math.round(plan.priceAnnualPaisa / 100 / 12) : null;

  const highlighted = plan.name === "pro";

  return (
    <div
      className={`rounded-xl border p-6 flex flex-col gap-5 ${
        highlighted ? "border-[#E8B04B] bg-[#1C170E]" : "border-[#262A33] bg-[#171A21]"
      }`}
    >
      <div>
        <p className="text-sm font-medium text-[#8A8F9C] capitalize">{plan.name}</p>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-3xl font-semibold text-[#F4F5F7]">
            {isFree ? "₹0" : `₹${priceRupees.toLocaleString("en-IN")}`}
          </span>
          {!isFree && (
            <span className="text-sm text-[#8A8F9C]">
              /{cycle === "monthly" ? "mo" : "yr"}
            </span>
          )}
        </div>
        {perMonthEquivalent && (
          <p className="text-xs text-[#5B6070] mt-1">
            ≈ ₹{perMonthEquivalent}/mo billed annually
          </p>
        )}
      </div>

      <ul className="text-sm text-[#C3C7D1] flex flex-col gap-2 flex-1">
        <li>
          {plan.dailyAiQueryLimit === -1
            ? "Unlimited"
            : plan.dailyAiQueryLimit}{" "}
          AI queries/day
        </li>
        <li>
          {plan.monthlyTournamentLimit === 0
            ? "No self-organized tournaments"
            : plan.monthlyTournamentLimit === -1
            ? "Unlimited tournament organizing"
            : `${plan.monthlyTournamentLimit} organized tournaments/mo`}
        </li>
        {plan.crownOrganizeCost !== null && (
          <li>Or organize any time for 👑 {plan.crownOrganizeCost}</li>
        )}
      </ul>

      <button
        onClick={() => onChoose(plan.name)}
        disabled={isFree || loading}
        className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
          isFree
            ? "bg-[#262A33] text-[#8A8F9C] cursor-default"
            : highlighted
            ? "bg-[#E8B04B] text-[#171208] hover:bg-[#F2BE63] disabled:opacity-60"
            : "bg-[#262A33] text-[#F4F5F7] hover:bg-[#31363F] disabled:opacity-60"
        }`}
      >
        {isFree
          ? "Your current plan"
          : loading
          ? "Processing..."
          : "Choose plan"}
      </button>
      {/* Bottom spacing so content bottom nav ke peeche na chhupe */}
<div className="h-16" />

<BottomNav activeTab="pricing" />
    </div>
  );
}