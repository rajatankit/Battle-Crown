"use client";
import { useState } from "react";
import { load } from "@cashfreepayments/cashfree-js";

const MIN_WITHDRAW = 100; // ⚠️ lib/walletConfig.js me bhi yehi value hai — dono ko saath me change karna

export default function GamingWallet({
  depositWallet,
  setDepositWallet,
  winningsWallet,
  setWinningsWallet,
  crowns,
  setCrowns,
  userEmail,
  savedUpiId = "", // agar user ne pehle withdraw kiya hai to prefill kar sakte ho
}) {
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");

  // --- Withdraw related states ---
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [upiId, setUpiId] = useState(savedUpiId);
  const [withdrawMessage, setWithdrawMessage] = useState("");
  const [pendingWithdraw, setPendingWithdraw] = useState(null); // { amount, status }

  const [redeemMessage, setRedeemMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // 1. Cashfree Deposit Handler (Real Gateway Integration)
  const handleCashfreeDeposit = async () => {
    if (!depositAmount || depositAmount <= 0) {
      alert("⚠️ Please enter a valid deposit amount!");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, amount: Number(depositAmount) })
      });
      const data = await res.json();

      if (data.success) {
        const cashfree = await load({ mode: "sandbox" });

        const checkoutOptions = {
          paymentSessionId: data.payment_session_id,
          redirectTarget: "_modal",
        };

        cashfree.checkout(checkoutOptions).then(async (result) => {
          if (result.error) {
            alert("Payment failed: " + result.error.message);
          } else if (result.redirect) {
            console.log("Payment redirected");
          } else {
            const verifyRes = await fetch('/api/wallet/verify-deposit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: userEmail, amount: Number(depositAmount), order_id: data.order_id })
            });
            const verifyData = await verifyRes.json();

            if (verifyData.success) {
              setDepositWallet(verifyData.depositWallet);
              alert("🎉 Payment Successful! Money added to your deposit wallet.");
            } else {
              alert("❌ Payment successful but failed to update wallet: " + verifyData.message);
            }
          }
        });
      } else {
        alert(`❌ ${data.message || "Order creation failed"}`);
      }
    } catch (err) {
      console.error(err);
      alert("❌ Network error during payment initialization.");
    } finally {
      setLoading(false);
      setShowDepositModal(false);
      setDepositAmount("");
    }
  };

  // 2. Open Withdraw Modal
  const openWithdrawModal = () => {
    if (winningsWallet <= 0) {
      setWithdrawMessage("⚠️ Insufficient winning balance to withdraw!");
      setTimeout(() => setWithdrawMessage(""), 4000);
      return;
    }
    if (winningsWallet < MIN_WITHDRAW) {
      setWithdrawMessage(`⚠️ Minimum withdrawal amount is ₹${MIN_WITHDRAW}`);
      setTimeout(() => setWithdrawMessage(""), 4000);
      return;
    }
    setWithdrawAmount("");
    setShowWithdrawModal(true);
  };

  // 3. Submit Withdraw Request — amount + UPI ID ke saath, request "Pending" status me jaati hai
  const handleWithdrawSubmit = async () => {
    const amt = Number(withdrawAmount);

    if (!amt || amt <= 0) {
      alert("⚠️ Please enter a valid amount!");
      return;
    }
    if (amt < MIN_WITHDRAW) {
      alert(`⚠️ Minimum withdrawal amount is ₹${MIN_WITHDRAW}`);
      return;
    }
    if (amt > winningsWallet) {
      alert("⚠️ Amount exceeds your winning wallet balance!");
      return;
    }
    if (!upiId || upiId.trim().length < 5) {
      alert("⚠️ Please enter a valid UPI ID!");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, amount: amt, upiId: upiId.trim() })
      });
      const data = await res.json();

      if (data.success) {
        setWinningsWallet(data.winningsWallet);
        setPendingWithdraw({ amount: amt, status: "pending" });
        setWithdrawMessage("✅ Withdrawal request submitted! Admin will verify and pay within 24 hours.");
        setShowWithdrawModal(false);
      } else {
        setWithdrawMessage(`❌ ${data.error || "Withdrawal request failed"}`);
      }
    } catch (err) {
      setWithdrawMessage("❌ Network error. Please try again.");
    } finally {
      setLoading(false);
      setWithdrawAmount("");
      setTimeout(() => setWithdrawMessage(""), 10000);
    }
  };

  // 4. Redeem Crowns Click Handler
  const handleRedeemClick = async () => {
    if (crowns < 20) {
      setRedeemMessage("❌ You need at least 20 Crowns to redeem!");
      setTimeout(() => setRedeemMessage(""), 4000);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/wallet/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail })
      });
      const data = await res.json();

      if (data.success) {
        setCrowns(data.crowns);
        setDepositWallet(data.depositWallet);
        setRedeemMessage("🎉 Successfully redeemed 20 Crowns for ₹10 Deposit cash!");
      } else {
        setRedeemMessage(`❌ ${data.error || "Redemption failed"}`);
      }
    } catch (err) {
      setRedeemMessage("❌ Server error during redemption.");
    } finally {
      setLoading(false);
      setTimeout(() => setRedeemMessage(""), 4000);
    }
  };

  return (
    <div className="bg-[#0f141c]/95 border border-gray-800 p-6 rounded-xl shadow-xl space-y-6 h-full flex flex-col justify-between relative">
      <div>
        <h3 className="text-base font-mono uppercase tracking-widest font-bold text-gray-400 mb-6">// GAMING WALLET</h3>

        <div className="space-y-6">
          {/* 1. Deposit Wallet */}
          <div className="bg-black/50 border border-gray-800 p-4 rounded-xl flex flex-col items-center gap-3">
            <div className="w-full flex justify-between items-center">
              <span className="text-base text-gray-200 font-bold uppercase tracking-wider">DEPOSIT WALLET</span>
              <span className="text-2xl font-black text-white">₹{depositWallet || 0}</span>
            </div>
            <button
              onClick={() => setShowDepositModal(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1.5 px-6 rounded-md text-xs uppercase tracking-wider cursor-pointer shadow-md transition"
            >
              + Deposit
            </button>
          </div>

          {/* 2. Winning Wallet */}
          <div className="bg-black/50 border border-gray-800 p-4 rounded-xl flex flex-col items-center gap-3">
            <div className="w-full flex justify-between items-center">
              <span className="text-base text-gray-200 font-bold uppercase tracking-wider">WINNING WALLET</span>
              <span className="text-2xl font-black text-green-400">₹{winningsWallet || 0}</span>
            </div>
            <button
              onClick={openWithdrawModal}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 px-6 rounded-md text-xs uppercase tracking-wider cursor-pointer shadow-md transition disabled:opacity-50"
            >
              {loading ? "Processing..." : "Withdraw"}
            </button>

            {pendingWithdraw && pendingWithdraw.status === "pending" && (
              <div className="w-full flex items-center justify-center gap-2 text-xs font-mono bg-orange-950/40 border border-orange-800/50 text-orange-400 p-2 rounded">
                ⏳ ₹{pendingWithdraw.amount} — Pending Admin Approval
              </div>
            )}

            {withdrawMessage && (
              <p className="text-xs text-yellow-400 font-mono text-center bg-yellow-950/40 p-2 rounded border border-yellow-800/50 mt-2">
                {withdrawMessage}
              </p>
            )}
          </div>

          {/* 3. Total Crowns */}
          <div className="bg-black/50 border border-gray-800 p-4 rounded-xl flex flex-col items-center gap-3">
            <div className="w-full flex justify-between items-center">
              <div>
                <span className="text-base text-yellow-400 font-bold uppercase tracking-wider block">Total Crowns</span>
                <span className="text-xs text-gray-400 font-mono italic">Earn 1 crown for every match entry</span>
              </div>
              <span className="text-2xl font-black text-yellow-400">👑 {crowns || 0}</span>
            </div>
            <button
              onClick={handleRedeemClick}
              disabled={loading}
              className="bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-1.5 px-6 rounded-md text-xs uppercase tracking-wider cursor-pointer shadow-md transition disabled:opacity-50"
            >
              {loading ? "Redeeming..." : "Redeem (20 Crowns = ₹10)"}
            </button>
            {redeemMessage && (
              <p className="text-xs text-cyan-400 font-mono text-center bg-cyan-950/40 p-2 rounded border border-cyan-800/50 mt-2">
                {redeemMessage}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* --- CASHFREE / DEPOSIT MODAL (POPUP) --- */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-[#141b26] border border-cyan-500/40 p-6 rounded-2xl max-w-sm w-full shadow-2xl text-center space-y-4 relative">
            <button
              onClick={() => setShowDepositModal(false)}
              className="absolute top-3 right-4 text-gray-400 hover:text-white text-lg font-bold"
            >
              ✕
            </button>

            <h4 className="text-lg font-bold text-cyan-400 uppercase tracking-wide">Add Money via Cashfree</h4>
            <p className="text-xs text-gray-300">Enter amount you want to add to your deposit wallet:</p>

            <input
              type="number"
              placeholder="Enter amount (e.g. 100)"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full p-3 bg-black/60 border border-gray-700 rounded-lg text-white text-center font-bold text-lg outline-none focus:border-cyan-500"
            />

            <button
              onClick={handleCashfreeDeposit}
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Connecting Gateway..." : "Proceed to Pay"}
            </button>
          </div>
        </div>
      )}

      {/* --- WITHDRAW MODAL (POPUP) --- */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-[#141b26] border border-emerald-500/40 p-6 rounded-2xl max-w-sm w-full shadow-2xl text-center space-y-4 relative">
            <button
              onClick={() => setShowWithdrawModal(false)}
              className="absolute top-3 right-4 text-gray-400 hover:text-white text-lg font-bold"
            >
              ✕
            </button>

            <h4 className="text-lg font-bold text-emerald-400 uppercase tracking-wide">Withdraw Winnings</h4>
            <p className="text-xs text-gray-300">
              Available balance: <span className="text-white font-bold">₹{winningsWallet}</span>
            </p>
            <p className="text-[10px] text-gray-500">Minimum withdrawal: ₹{MIN_WITHDRAW}</p>

            <input
              type="number"
              placeholder={`Enter amount (min ₹${MIN_WITHDRAW})`}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="w-full p-3 bg-black/60 border border-gray-700 rounded-lg text-white text-center font-bold text-lg outline-none focus:border-emerald-500"
            />

            <input
              type="text"
              placeholder="Enter your UPI ID (e.g. name@upi)"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              className="w-full p-3 bg-black/60 border border-gray-700 rounded-lg text-white text-center font-bold text-sm outline-none focus:border-emerald-500"
            />

            <button
              onClick={() => setWithdrawAmount(String(winningsWallet))}
              className="text-xs text-emerald-400 underline underline-offset-2"
            >
              Withdraw All (₹{winningsWallet})
            </button>

            <button
              onClick={handleWithdrawSubmit}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Submitting..." : "Submit Withdrawal Request"}
            </button>

            <p className="text-[10px] text-gray-500">
              Request submit hote hi amount wallet se lock ho jayega. Admin verify karke UPI pe manually bhejega.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}