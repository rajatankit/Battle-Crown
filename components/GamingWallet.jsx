"use client";

import { useState, useEffect } from "react";
import { load } from "@cashfreepayments/cashfree-js";

const MIN_WITHDRAW = 100;

export default function GamingWallet({
  depositWallet,
  setDepositWallet,
  winningsWallet,
  setWinningsWallet,
  crowns,
  setCrowns,
  userEmail,
  savedUpiId = "",
  onWalletChange = () => {}, 
}) {
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [upiId, setUpiId] = useState(savedUpiId);
  const [withdrawMessage, setWithdrawMessage] = useState("");
  const [pendingWithdraw, setPendingWithdraw] = useState(null);

  const [redeemMessage, setRedeemMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [transactions, setTransactions] = useState([]);
const [transactionsLoading, setTransactionsLoading] = useState(true);

useEffect(() => {
  if (!userEmail) return;

  const fetchTransactions = async () => {
    try {
      setTransactionsLoading(true);

      const res = await fetch(
        `/api/user/transactions?email=${encodeURIComponent(userEmail)}`
      );

      const data = await res.json();

      if (data.success) {
        setTransactions(data.transactions || []);
      } else {
        console.error("Transaction fetch failed:", data.error);
      }
    } catch (error) {
      console.error("Transaction history error:", error);
    } finally {
      setTransactionsLoading(false);
    }
  };

  fetchTransactions();
}, [userEmail]);

  const handleCashfreeDeposit = async () => {
    if (!depositAmount || Number(depositAmount) <= 0) {
      alert("⚠️ Please enter a valid deposit amount!");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, amount: Number(depositAmount) }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(`❌ ${data.message || "Order creation failed"}`);
        return;
      }
      const cashfree = await load({ mode: "sandbox" });
      const checkoutOptions = { paymentSessionId: data.payment_session_id, redirectTarget: "_modal" };
      cashfree.checkout(checkoutOptions).then(async (result) => {
        if (result.error) {
          alert("Payment failed: " + result.error.message);
          return;
        }
        if (result.redirect) return;
        const verifyRes = await fetch("/api/wallet/verify-deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail, amount: Number(depositAmount), order_id: data.order_id }),
        });
        const verifyData = await verifyRes.json();
        if (verifyData.success) {
          setDepositWallet(verifyData.depositWallet);
          onWalletChange();
          alert("🎉 Payment Successful! Money added to your deposit wallet.");
        } else {
          alert("❌ Payment successful but failed to update wallet: " + verifyData.message);
        }
      });
    } catch (err) {
      console.error("Cashfree deposit error:", err);
      alert("❌ Network error during payment initialization.");
    } finally {
      setLoading(false);
      setShowDepositModal(false);
      setDepositAmount("");
    }
  };

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
    setWithdrawMessage("");
    setShowWithdrawModal(true);
  };

  const handleWithdrawSubmit = async () => {
    const amt = Number(withdrawAmount);
    if (!amt || amt <= 0) { alert("⚠️ Please enter a valid amount!"); return; }
    if (amt < MIN_WITHDRAW) { alert(`⚠️ Minimum withdrawal amount is ₹${MIN_WITHDRAW}`); return; }
    if (amt > winningsWallet) { alert("⚠️ Amount exceeds your winning wallet balance!"); return; }
    if (!upiId || upiId.trim().length < 5) { alert("⚠️ Please enter a valid UPI ID!"); return; }

    try {
      setLoading(true);
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, amount: amt, upiId: upiId.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setWinningsWallet(data.winningsWallet);
        onWalletChange();
        setPendingWithdraw({ amount: amt, status: "pending" });
        setWithdrawMessage("✅ Withdrawal request submitted! Admin will verify and pay within 24 hours.");
        setShowWithdrawModal(false);
      } else {
        setWithdrawMessage(`❌ ${data.error || "Withdrawal request failed"}`);
      }
    } catch (err) {
      console.error("Withdrawal error:", err);
      setWithdrawMessage("❌ Network error. Please try again.");
    } finally {
      setLoading(false);
      setWithdrawAmount("");
      setTimeout(() => setWithdrawMessage(""), 10000);
    }
  };

  const handleRedeemClick = async () => {
    if (crowns < 20) {
      setRedeemMessage("❌ You need at least 20 Crowns to redeem!");
      setTimeout(() => setRedeemMessage(""), 4000);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/wallet/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setCrowns(data.crowns);
        setDepositWallet(data.depositWallet);
        onWalletChange();
        setRedeemMessage("🎉 Successfully redeemed 20 Crowns for ₹10 Deposit cash!");
      } else {
        setRedeemMessage(`❌ ${data.error || "Redemption failed"}`);
      }
    } catch (err) {
      console.error("Redeem error:", err);
      setRedeemMessage("❌ Server error during redemption.");
    } finally {
      setLoading(false);
      setTimeout(() => setRedeemMessage(""), 4000);
    }
  };

  const depositBalance = Number(depositWallet || 0);
  const winningBalance = Number(winningsWallet || 0);
  const crownBalance = Number(crowns || 0);
  const crownProgress = Math.min((crownBalance / 20) * 100, 100);

  return (
  <>

      <div className="relative overflow-hidden rounded-2xl border border-gray-800/80 bg-[#080d14]/95 shadow-2xl h-full">
        <div className="absolute -top-32 -right-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 h-64 w-64 rounded-full bg-yellow-500/5 blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-cyan-500 to-transparent" />

        <div className="relative p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div>
              <p className="text-[9px] text-cyan-500/80 font-mono tracking-[0.22em] uppercase mb-1">// Player Financial Hub</p>
              <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">Gaming Wallet</h3>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/30 border border-cyan-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[9px] text-cyan-300 font-mono uppercase tracking-wider">Wallet Active</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
           <div
  className="group relative overflow-hidden rounded-xl border border-cyan-500/30 p-4 transition-all duration-300 hover:border-cyan-400/70 bg-cover bg-center"
  style={{
    backgroundImage: `
      linear-gradient(
        90deg,
        rgba(3,12,25,0.94),
        rgba(3,15,30,0.72),
        rgba(3,12,25,0.88)
      ),
      url('/images/wallet-deposit-bg.jpg')
    `,
  }}
>
  <div className="absolute inset-0 bg-cyan-500/5 pointer-events-none" />

  <div className="relative">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center">
          <span className="text-lg">💳</span>
        </div>

        <div>
          <p className="text-[9px] text-cyan-400 uppercase font-black tracking-wider">
            Deposit Wallet
          </p>
          <p className="text-[8px] text-gray-400 font-mono">
            Entry Balance
          </p>
        </div>
      </div>

      <span className="text-[8px] text-cyan-300 border border-cyan-400/40 bg-cyan-950/50 px-1.5 py-0.5 rounded">
        ACTIVE
      </span>
    </div>

    <div className="mb-4">
      <span className="text-[10px] text-gray-300 font-mono">
        AVAILABLE BALANCE
      </span>

      <div className="flex items-end gap-1 mt-0.5">
        <span className="text-xl sm:text-2xl font-black text-white">
          ₹{depositBalance}
        </span>
        <span className="text-[9px] text-gray-400 mb-1">
          INR
        </span>
      </div>
    </div>

    <button
      onClick={() => setShowDepositModal(true)}
      disabled={loading}
      className="w-full py-2.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-black font-black text-[10px] uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
    >
      + Add Money
    </button>
  </div>
</div>

          <div className="group relative overflow-hidden rounded-xl border border-emerald-500/30 p-4 transition-all duration-300 hover:border-emerald-400/70 bg-cover bg-center"
  style={{
    backgroundImage: `
      linear-gradient(
        90deg,
        rgba(2,18,15,0.95),
        rgba(3,30,23,0.68),
        rgba(2,15,12,0.90)
      ),
      url('/images/wallet-withdraw-bg.jpg')
    `,
  }}
>
  <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none" />

  <div className="relative">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-emerald-950/70 border border-emerald-500/40 flex items-center justify-center">
          <span className="text-lg">🏆</span>
        </div>

        <div>
          <p className="text-[9px] text-emerald-400 uppercase font-black tracking-wider">
            Winning Wallet
          </p>
          <p className="text-[8px] text-gray-400 font-mono">
            Tournament Earnings
          </p>
        </div>
      </div>

      <span className="text-[8px] text-emerald-300 border border-emerald-400/40 bg-emerald-950/50 px-1.5 py-0.5 rounded">
        PAYOUT
      </span>
    </div>

    <div className="mb-4">
      <span className="text-[10px] text-gray-300 font-mono">
        WITHDRAWABLE BALANCE
      </span>

      <div className="flex items-end gap-1 mt-0.5">
        <span className="text-xl sm:text-2xl font-black text-emerald-400">
          ₹{winningBalance}
        </span>

        <span className="text-[9px] text-gray-400 mb-1">
          INR
        </span>
      </div>
    </div>

    <button
      onClick={openWithdrawModal}
      disabled={loading}
      className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
    >
      {loading ? "Processing..." : "Withdraw Winnings"}
    </button>
  </div>
</div>
</div>

          {pendingWithdraw?.status === "pending" && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-orange-800/50 bg-orange-950/20 p-3">
              <div className="w-9 h-9 rounded-lg bg-orange-950/60 border border-orange-800/50 flex items-center justify-center shrink-0">⏳</div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-orange-400 uppercase font-black tracking-wider">Withdrawal Pending</p>
                <p className="text-[10px] text-gray-400 mt-0.5">₹{pendingWithdraw.amount} is awaiting admin verification.</p>
              </div>
              <span className="text-[8px] font-black text-orange-400 border border-orange-800/60 px-2 py-1 rounded">PENDING</span>
            </div>
          )}

         <div
  className="relative mt-4 overflow-hidden rounded-xl border border-yellow-500/30 p-4 bg-cover bg-center"
  style={{
    backgroundImage: `
      linear-gradient(
        90deg,
        rgba(22,16,3,0.96),
        rgba(35,25,4,0.65),
        rgba(12,9,2,0.92)
      ),
      url('/images/wallet-crown-bg.jpg')
    `,
  }}
>
  <div className="absolute inset-0 bg-yellow-500/5 pointer-events-none" />

  <div className="relative">
    <div className="flex items-center justify-between gap-3">

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-yellow-950/70 border border-yellow-500/40 flex items-center justify-center shadow-lg">
          <span className="text-xl">👑</span>
        </div>

        <div>
          <p className="text-[9px] text-yellow-400 uppercase font-black tracking-[0.15em]">
            Crown Rewards
          </p>

          <p className="text-[8px] text-gray-400 font-mono mt-0.5">
            Earn 1 Crown per match entry
          </p>
        </div>
      </div>

      <div className="text-right">
        <p className="text-xl font-black text-yellow-400">
          {crownBalance}
        </p>

        <p className="text-[8px] text-gray-400 uppercase font-mono">
          Crowns
        </p>
      </div>

    </div>

    <div className="mt-4">

      <div className="flex justify-between mb-1.5">
        <span className="text-[8px] text-gray-400 uppercase font-mono">
          Redeem Progress
        </span>

        <span className="text-[8px] text-yellow-400 font-bold">
          {Math.min(crownBalance, 20)} / 20
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-black/80 border border-yellow-900/50 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-yellow-600 via-yellow-400 to-amber-300 rounded-full transition-all duration-500"
          style={{ width: `${crownProgress}%` }}
        />
      </div>

    </div>

    <button
      onClick={handleRedeemClick}
      disabled={loading || crownBalance < 20}
      className="w-full mt-4 py-2.5 rounded-lg border border-yellow-500/60 bg-yellow-950/60 hover:bg-yellow-900/60 text-yellow-300 hover:text-yellow-200 font-black text-[10px] uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {loading ? "Redeeming..." : "Redeem 20 Crowns → ₹10"}
    </button>

    {redeemMessage && (
      <div className="mt-3 text-[9px] text-center font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-800/50 rounded-lg p-2.5">
        {redeemMessage}
      </div>
    )}

  </div>
</div>

          {withdrawMessage && (
            <div className="mt-4 text-[9px] text-center font-mono text-yellow-300 bg-yellow-950/20 border border-yellow-800/50 rounded-lg p-2.5">{withdrawMessage}</div>
          )}

          {/* Transaction History */}
<div className="mt-5 rounded-xl border border-gray-800/80 bg-black/30 overflow-hidden">

  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/80">
    <div>
      <p className="text-[9px] text-cyan-500/80 font-mono tracking-[0.18em] uppercase">
        // Wallet Activity
      </p>

      <h4 className="text-sm font-black text-white uppercase tracking-wider mt-0.5">
        Transaction History
      </h4>
    </div>

    <span className="text-[8px] text-gray-500 font-mono uppercase">
      {transactions.length} Records
    </span>
  </div>

  <div className="max-h-[320px] overflow-y-auto">

    {transactionsLoading ? (
      <div className="p-6 text-center">
        <div className="inline-block w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-[9px] text-gray-500 font-mono mt-2">
          Loading transactions...
        </p>
      </div>

    ) : transactions.length === 0 ? (

      <div className="p-8 text-center">
        <div className="mx-auto w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-3">
          💳
        </div>

        <p className="text-xs text-gray-400 font-bold">
          No Transactions Yet
        </p>

        <p className="text-[9px] text-gray-600 font-mono mt-1">
          Your wallet activity will appear here.
        </p>
      </div>

    ) : (

      <div className="divide-y divide-gray-800/60">

        {transactions.map((transaction) => {

          const amount = Number(transaction.amount || 0);

          const type = String(transaction.type || "").toLowerCase();

          const isCredit =
            type.includes("deposit") ||
            type.includes("credit") ||
            type.includes("winning") ||
            type.includes("reward") ||
            type.includes("redeem");

          const date = transaction.createdAt
            ? new Date(transaction.createdAt).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";

          return (
            <div
              key={transaction.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition"
            >

              {/* Icon */}
              <div
                className={`w-9 h-9 shrink-0 rounded-lg border flex items-center justify-center ${
                  isCredit
                    ? "bg-emerald-950/40 border-emerald-800/50"
                    : "bg-red-950/30 border-red-800/50"
                }`}
              >
                <span className="text-sm">
                  {isCredit ? "↗" : "↘"}
                </span>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">

                <p className="text-[10px] text-white font-bold truncate">
                  {transaction.description ||
                    transaction.type ||
                    "Wallet Transaction"}
                </p>

                <p className="text-[8px] text-gray-600 font-mono mt-0.5">
                  {date}
                </p>

              </div>

              {/* Amount */}
              <div className="text-right shrink-0">

                <p
                  className={`text-xs font-black ${
                    isCredit
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {isCredit ? "+" : "-"}₹{amount}
                </p>

                <p className="text-[7px] text-gray-600 uppercase font-mono mt-0.5">
                  {transaction.type || "Transaction"}
                </p>

              </div>

            </div>
          );
        })}

      </div>
    )}

  </div>
</div>

          <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[8px] text-gray-600 font-mono uppercase tracking-wider">
            <span>🔒 Secure Wallet</span>
            <span className="hidden sm:block">•</span>
            <span>Tournament Transactions</span>
            <span className="hidden sm:block">•</span>
            <span>Battle Crown</span>
          </div>
        </div>
      </div>

      {showDepositModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-cyan-500/50 bg-[#0b111a] shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 to-transparent" />
            <div className="p-6">
              <button onClick={() => setShowDepositModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition text-lg">✕</button>
              <div className="text-center mb-6">
                <div className="mx-auto w-12 h-12 rounded-xl bg-cyan-950/60 border border-cyan-700/50 flex items-center justify-center mb-3">💳</div>
                <h4 className="text-base font-black text-cyan-400 uppercase tracking-wider">Add Money</h4>
                <p className="text-[10px] text-gray-500 font-mono mt-1">Secure payment via Cashfree</p>
              </div>
              <div className="bg-black/50 rounded-xl border border-gray-800 p-4">
                <label className="text-[9px] text-gray-500 uppercase font-bold tracking-wider block mb-2">Deposit Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400 font-black">₹</span>
                  <input type="number" placeholder="Enter amount" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="w-full p-3 pl-8 bg-black/70 border border-gray-700 rounded-lg text-white font-black text-lg outline-none focus:border-cyan-400 transition" />
                </div>
              </div>
              <button onClick={handleCashfreeDeposit} disabled={loading} className="w-full mt-4 py-3 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-black font-black text-[10px] uppercase tracking-wider transition disabled:opacity-50">
                {loading ? "Connecting Gateway..." : "Proceed to Secure Payment →"}
              </button>
              <p className="text-[8px] text-gray-600 text-center font-mono mt-4">🔒 Payment processing handled securely by Cashfree</p>
            </div>
          </div>
        </div>
      )}

      {showWithdrawModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-emerald-500/50 bg-[#0b111a] shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-transparent" />
            <div className="p-6">
              <button onClick={() => setShowWithdrawModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition text-lg">✕</button>
              <div className="text-center mb-6">
                <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-700/50 flex items-center justify-center mb-3">💸</div>
                <h4 className="text-base font-black text-emerald-400 uppercase tracking-wider">Withdraw Winnings</h4>
                <p className="text-[10px] text-gray-500 font-mono mt-1">Transfer your tournament earnings</p>
              </div>
              <div className="rounded-xl bg-emerald-950/20 border border-emerald-800/50 p-4 text-center mb-4">
                <p className="text-[8px] text-gray-500 uppercase font-mono">Available Winnings</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">₹{winningBalance}</p>
                <p className="text-[8px] text-gray-600 font-mono mt-1">Minimum withdrawal ₹{MIN_WITHDRAW}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] text-gray-500 uppercase font-bold tracking-wider block mb-1.5">Withdrawal Amount</label>
                  <input type="number" placeholder={`Min ₹${MIN_WITHDRAW}`} value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="w-full p-3 bg-black/70 border border-gray-700 rounded-lg text-white text-sm font-bold outline-none focus:border-emerald-400 transition" />
                </div>
                <button onClick={() => setWithdrawAmount(String(winningBalance))} className="w-full text-[9px] text-emerald-400 uppercase font-black border border-emerald-900/60 bg-emerald-950/20 py-2 rounded-lg hover:bg-emerald-950/40 transition">
                  Withdraw Full Balance · ₹{winningBalance}
                </button>
                <div>
                  <label className="text-[9px] text-gray-500 uppercase font-bold tracking-wider block mb-1.5">UPI ID</label>
                  <input type="text" placeholder="yourname@upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} className="w-full p-3 bg-black/70 border border-gray-700 rounded-lg text-white text-sm font-bold outline-none focus:border-emerald-400 transition" />
                </div>
              </div>
              <button onClick={handleWithdrawSubmit} disabled={loading} className="w-full mt-5 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-wider transition disabled:opacity-50">
                {loading ? "Submitting Request..." : "Submit Withdrawal Request →"}
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
