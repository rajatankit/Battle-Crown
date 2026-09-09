"use client";
import BottomNav from "./BottomNav";
import PaymentHistory from "./PaymentHistory";

export default function WalletTab({
  userEmail,
  getIdToken = async () => null,
  onNavigate = () => {},
  activeTab = "wallet",
}) {
  return (
    <div className="relative min-h-screen bg-[#050912] text-white font-mono pb-24 overflow-hidden">
      {/* GAMING BACKGROUND */}
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

      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-20 left-[-120px] w-72 h-72 bg-cyan-500/10 blur-[120px]" />
        <div className="absolute top-[45%] right-[-120px] w-80 h-80 bg-blue-600/10 blur-[130px]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-60 bg-cyan-500/5 blur-[120px]" />
      </div>

      {/* HEADER */}
      <header className="sticky top-0 z-30 px-4 pt-5 pb-4 border-b border-cyan-500/10 bg-[#050912]/75 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/crown-logo.png" alt="Battle Crown" className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
            <h1 className="text-lg sm:text-xl font-black italic tracking-tight">
              BATTLE <span className="text-cyan-400">CROWN</span>
            </h1>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-400/20 bg-cyan-950/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[9px] font-bold text-cyan-300 uppercase tracking-wider">Wallet Active</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="relative z-10 px-4 pt-5 space-y-5">
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.25em]">Player Dashboard</p>
          <h2 className="text-xl font-black uppercase tracking-wider text-white mt-1">Payment & Rewards</h2>
        </div>

        <div className="h-px bg-gradient-to-r from-cyan-400/70 via-cyan-400/20 to-transparent" />

        <div
          className="
            relative
            rounded-2xl
            border border-cyan-400/20
            bg-[#08111d]/75
            backdrop-blur-xl
            shadow-[0_0_40px_rgba(0,200,255,0.06)]
            overflow-hidden
          "
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
          <PaymentHistory userEmail={userEmail} getIdToken={getIdToken} />
        </div>

        <div className="h-6" />
      </main>

      <BottomNav activeTab={activeTab} onNavigate={onNavigate} />
    </div>
  );
}