"use client";

import BottomNav from "./BottomNav";
import GamingWallet from "./GamingWallet";

export default function WalletTab({
  depositWallet,
  setDepositWallet,
  winningsWallet,
  setWinningsWallet,
  crowns,
  setCrowns,
  userEmail,
  totalEarned,
  totalWithdrawn,
  transactions = [],
  onNavigate = () => {},
  activeTab = "wallet",
}) {
  return (
    <div className="relative min-h-screen bg-[#050912] text-white font-mono pb-24 overflow-hidden">

      {/* =========================================================
          GAMING BACKGROUND
      ========================================================= */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{
          backgroundImage: `
            linear-gradient(
              to bottom,
              rgba(3,8,18,0.72),
              rgba(3,8,18,0.94)
            ),
            radial-gradient(
              circle at 50% 20%,
              rgba(0,220,255,0.12),
              transparent 38%
            ),
            url('/images/wallet-deposit-bg.jpg')
          `,
        }}
      />

      {/* Dark blue atmospheric glow */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-20 left-[-120px] w-72 h-72 bg-cyan-500/10 blur-[120px]" />
        <div className="absolute top-[45%] right-[-120px] w-80 h-80 bg-blue-600/10 blur-[130px]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-60 bg-cyan-500/5 blur-[120px]" />
      </div>

      {/* =========================================================
          HEADER
      ========================================================= */}
      <header className="sticky top-0 z-30 px-4 pt-5 pb-4 border-b border-cyan-500/10 bg-[#050912]/75 backdrop-blur-xl">

        <div className="flex items-center justify-between">

          <div>
            <p className="text-[9px] text-cyan-400/70 uppercase tracking-[0.28em] mb-1">
              // PLAYER FINANCIAL HUB
            </p>

            <h1 className="text-lg sm:text-xl font-black italic tracking-tight">
              BATTLE{" "}
              <span className="text-cyan-400">
                CROWN
              </span>
            </h1>
          </div>

          {/* Wallet status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-400/20 bg-cyan-950/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[9px] font-bold text-cyan-300 uppercase tracking-wider">
              Wallet Active
            </span>
          </div>

        </div>
      </header>

      {/* =========================================================
          MAIN WALLET CONTENT
      ========================================================= */}
      <main className="relative z-10 px-4 pt-5 space-y-5">

        {/* Page title */}
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.25em]">
            Player Dashboard
          </p>

          <h2 className="text-xl font-black uppercase tracking-wider text-white mt-1">
            Gaming Wallet
          </h2>

          <div className="mt-3 h-px bg-gradient-to-r from-cyan-400/70 via-cyan-400/20 to-transparent" />
        </div>

        {/* =====================================================
            EXISTING GAMING WALLET
            FUNCTIONALITY UNCHANGED
        ===================================================== */}
        <div className="
          relative
          rounded-2xl
          border border-cyan-400/20
          bg-[#08111d]/75
          backdrop-blur-xl
          shadow-[0_0_40px_rgba(0,200,255,0.06)]
          overflow-hidden
        ">

          {/* top glow */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />

          <GamingWallet
            depositWallet={depositWallet}
            setDepositWallet={setDepositWallet}
            winningsWallet={winningsWallet}
            setWinningsWallet={setWinningsWallet}
            crowns={crowns}
            setCrowns={setCrowns}
            userEmail={userEmail}
          />

        </div>

        {/* =====================================================
            EARNINGS SUMMARY
        ===================================================== */}
        {(totalEarned !== undefined || totalWithdrawn !== undefined) && (
          <section>

            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[9px] text-gray-500 uppercase tracking-[0.2em]">
                  Financial Overview
                </p>

                <h3 className="text-xs font-black uppercase tracking-wider text-gray-200 mt-1">
                  Wallet Summary
                </h3>
              </div>

              <span className="text-[9px] text-cyan-400/70">
                LIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">

              {/* Total Earned */}
              <div className="
                relative overflow-hidden
                rounded-2xl
                border border-green-500/20
                bg-gradient-to-br from-green-950/50 via-[#0b1718]/90 to-[#071014]/90
                backdrop-blur-xl
                p-4
                shadow-[0_0_25px_rgba(34,197,94,0.05)]
              ">

                <div className="absolute top-0 right-0 w-20 h-20 bg-green-400/5 blur-2xl" />

                <p className="text-[9px] text-gray-500 uppercase tracking-wider">
                  Total Earned
                </p>

                <p className="text-xl font-black text-green-400 mt-2">
                  ₹{totalEarned ?? 0}
                </p>

                <p className="text-[8px] text-green-400/50 uppercase mt-1">
                  Lifetime Earnings
                </p>
              </div>

              {/* Total Withdrawn */}
              <div className="
                relative overflow-hidden
                rounded-2xl
                border border-gray-700/50
                bg-gradient-to-br from-[#101923] via-[#0b111a] to-[#070b11]
                backdrop-blur-xl
                p-4
              ">

                <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-400/5 blur-2xl" />

                <p className="text-[9px] text-gray-500 uppercase tracking-wider">
                  Total Withdrawn
                </p>

                <p className="text-xl font-black text-gray-200 mt-2">
                  ₹{totalWithdrawn ?? 0}
                </p>

                <p className="text-[8px] text-gray-500 uppercase mt-1">
                  Successfully Paid
                </p>
              </div>

            </div>
          </section>
        )}

        {/* =====================================================
            RECENT TRANSACTIONS
        ===================================================== */}
        {transactions.length > 0 && (
          <section className="
            relative
            overflow-hidden
            rounded-2xl
            border border-gray-800/80
            bg-[#08101a]/85
            backdrop-blur-xl
          ">

            {/* top cyan line */}
            <div className="h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

            {/* Header */}
            <div className="
              flex
              justify-between
              items-center
              px-4
              py-4
              border-b border-gray-800/70
            ">

              <div>
                <p className="text-[9px] text-gray-500 uppercase tracking-[0.2em]">
                  Wallet Activity
                </p>

                <h3 className="text-xs font-black text-gray-200 uppercase tracking-wider mt-1">
                  Recent Transactions
                </h3>
              </div>

              <button
                type="button"
                className="text-[9px] text-cyan-400 font-bold uppercase tracking-wider hover:text-cyan-300 transition"
              >
                View All →
              </button>

            </div>

            {/* Transactions */}
            <div className="divide-y divide-gray-800/60">

              {transactions.slice(0, 6).map((tx) => {

                const positive = tx.amount >= 0;

                return (
                  <div
                    key={tx.id}
                    className="
                      flex
                      items-center
                      justify-between
                      px-4
                      py-3.5
                      hover:bg-cyan-950/20
                      transition
                    "
                  >

                    <div className="flex items-center gap-3">

                      {/* Transaction icon */}
                      <div
                        className={`
                          w-8 h-8
                          rounded-lg
                          flex items-center justify-center
                          border
                          ${
                            positive
                              ? "bg-green-950/40 border-green-500/20 text-green-400"
                              : "bg-red-950/40 border-red-500/20 text-red-400"
                          }
                        `}
                      >
                        {positive ? "↗" : "↘"}
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-white">
                          {tx.label}
                        </p>

                        <p className="text-[8px] text-gray-500 mt-0.5">
                          {tx.date}
                        </p>
                      </div>

                    </div>

                    <div className="text-right">

                      <p
                        className={`text-xs font-black ${
                          positive
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {positive ? "+" : "-"}₹
                        {Math.abs(tx.amount)}
                      </p>

                      <p className="text-[8px] text-gray-600 uppercase mt-0.5">
                        {tx.status || "Success"}
                      </p>

                    </div>

                  </div>
                );
              })}

            </div>
          </section>
        )}

        {/* Bottom spacing */}
        <div className="h-6" />

      </main>

      {/* =========================================================
          BOTTOM NAV
      ========================================================= */}
      <BottomNav
        activeTab={activeTab}
        onNavigate={onNavigate}
      />

    </div>
  );
}