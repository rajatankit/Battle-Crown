"use client";
import { useEffect, useState } from "react";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function PersonalAssistantPage() {
  const [state, setState] = useState({ loading: true, message: "Checking secure access…" });
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setState({ loading: false, message: "Sign in with your Battle Crown account first." });
        return;
      }
      user.getIdToken().then(async (token) => {
        const response = await fetch("/api/personal/status", { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json();
        setState({ loading: false, message: payload.success ? "Personal owner verified. Passkey enrollment can now be enabled." : payload.error || "Secure access check failed.", firebaseUid: user.uid, ownerVerified: Boolean(payload.success) });
      }).catch(() => setState({ loading: false, message: "Secure access check failed." }));
    });
    return unsubscribe;
  }, []);
  return <main className="min-h-screen bg-[#0b0f17] p-6 text-white"><section className="mx-auto max-w-md rounded-xl border border-cyan-500/40 bg-[#0f141c] p-6"><p className="text-xs font-semibold tracking-widest text-cyan-400">PERSONAL COMMAND CENTER</p><h1 className="mt-2 text-2xl font-black">Secure phone enrollment</h1><p className="mt-4 text-sm text-gray-300">{state.message}</p>{!state.loading && state.firebaseUid && !state.ownerVerified && <p className="mt-4 break-all rounded bg-black/30 p-3 text-xs text-gray-400">Your Firebase UID: {state.firebaseUid}</p>}</section></main>;
}
