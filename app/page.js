"use client";

import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#07090e] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      
      {/* Background Glowing Effects */}
      <div className="absolute w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -top-32 -left-32"></div>
      <div className="absolute w-[500px] h-[500px] bg-yellow-500/10 rounded-full blur-3xl pointer-events-none -bottom-32 -right-32"></div>

      <div className="text-center max-w-2xl z-10 space-y-6">
        
        {/* Badge */}
        <div className="inline-block bg-cyan-500/10 border border-cyan-500/30 px-4 py-1.5 rounded-full text-cyan-400 text-xs font-bold tracking-widest uppercase">
          ⚡ THE ULTIMATE ESPORTS TOURNAMENT PLATFORM
        </div>

        {/* Big Game Title */}
        <h1 className="text-5xl md:text-7xl font-black tracking-wider italic uppercase drop-shadow-[0_0_25px_rgba(6,182,212,0.4)]">
          BATTLE <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-yellow-400">CROWN</span>
        </h1>

        {/* Attractive Gaming Tagline */}
        <p className="text-gray-300 text-base md:text-lg tracking-wide leading-relaxed font-medium">
          Step into the grid. Prove your dominance, conquer elite tournaments, and claim your absolute legacy among legends.
        </p>

        {/* Enter Arena Button */}
        <div className="pt-4">
          <button
            onClick={() => router.push("/login")}
            className="group relative inline-flex items-center justify-center px-10 py-5 text-lg font-black tracking-widest uppercase text-black bg-gradient-to-r from-cyan-400 to-yellow-400 rounded-xl overflow-hidden shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/50 hover:scale-105 transition-all duration-300 cursor-pointer"
          >
            <span className="absolute w-0 h-0 transition-all duration-500 ease-out bg-white rounded-full group-hover:w-56 group-hover:h-56 opacity-20"></span>
            <span className="relative flex items-center gap-3">
              ENTER ARENA ⚔️
            </span>
          </button>
        </div>

        {/* Footer info text */}
        <p className="text-xs text-gray-500 tracking-widest uppercase pt-6">
          // SECURE AGENT AUTHENTICATION REQUIRED //
        </p>

      </div>
    </main>
  );
}