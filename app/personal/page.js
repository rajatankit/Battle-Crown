"use client";

import { useEffect, useState } from "react";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function PersonalAssistantPage() {
  const [state, setState] = useState({
    loading: true,
    message: "Checking secure access…",
    ownerVerified: false,
    firebaseUid: "",
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setState({
          loading: false,
          message: "Sign in with your Battle Crown account first.",
          ownerVerified: false,
          firebaseUid: "",
        });
        return;
      }

      user.getIdToken().then(async (token) => {
        try {
          const response = await fetch("/api/personal/status", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = await response.json();

          setState({
            loading: false,
            message: payload.success
              ? "CORTEX Online"
              : payload.error || "Secure access check failed.",
            ownerVerified: Boolean(payload.success),
            firebaseUid: user.uid,
          });
        } catch {
          setState({
            loading: false,
            message: "Secure access check failed.",
            ownerVerified: false,
            firebaseUid: user.uid,
          });
        }
      });
    });

    return unsubscribe;
  }, []);

  // ==================== LOADING / NOT VERIFIED ====================
  if (state.loading || !state.ownerVerified) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-cyan-500 text-sm tracking-widest mb-3">
            PERSONAL COMMAND CENTER
          </p>
          <p className="text-gray-300 text-sm">{state.message}</p>
          {state.firebaseUid && !state.ownerVerified && (
            <p className="mt-4 text-xs text-gray-600 break-all max-w-xs mx-auto">
              UID: {state.firebaseUid}
            </p>
          )}
        </div>
      </main>
    );
  }

  // ==================== MAIN CORTEX UI ====================
  return (
    <main className="relative min-h-screen bg-black overflow-hidden flex flex-col items-center justify-center">
      
      {/* Background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(220,38,38,0.08)_0%,_transparent_70%)]"></div>

      {/* Status Text */}
      <div className="absolute top-8 left-0 right-0 text-center z-10">
        <p className="text-red-500/80 text-xs tracking-[0.3em] font-medium">
          CORTEX
        </p>
        <p className="text-gray-500 text-[10px] mt-1 tracking-widest">
          ONLINE
        </p>
      </div>

      {/* ========== RED ORB ========== */}
      <div className="relative z-10 flex items-center justify-center">
        
        {/* Outer glow */}
        <div className="absolute w-64 h-64 rounded-full bg-red-600/20 blur-3xl animate-pulse"></div>
        
        {/* Middle rings */}
        <div className="absolute w-48 h-48 rounded-full border border-red-500/30 animate-[spin_12s_linear_infinite]"></div>
        <div className="absolute w-40 h-40 rounded-full border border-red-600/20 animate-[spin_8s_linear_infinite_reverse]"></div>

        {/* Main Orb */}
        <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-red-600 via-red-800 to-black shadow-[0_0_60px_rgba(220,38,38,0.6)] animate-[pulse_3s_ease-in-out_infinite] flex items-center justify-center">
          
          {/* Inner core */}
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-400 to-red-900 shadow-inner animate-[pulse_2s_ease-in-out_infinite]"></div>
          
          {/* Shine */}
          <div className="absolute top-4 left-6 w-6 h-6 rounded-full bg-white/20 blur-sm"></div>
        </div>
      </div>

      {/* Bottom text */}
      <div className="absolute bottom-16 left-0 right-0 text-center z-10">
        <p className="text-gray-500 text-xs tracking-widest">
          Ready for commands
        </p>
      </div>

    </main>
  );
}