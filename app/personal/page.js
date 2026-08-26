"use client";

import { useEffect, useRef, useState } from "react";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function PersonalAssistantPage() {
  const [state, setState] = useState({
    loading: true,
    message: "Checking secure access…",
    ownerVerified: false,
    firebaseUid: "",
  });

  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const recognitionRef = useRef(null);
  const idTokenRef = useRef(null);
  const unlockedRef = useRef(false); // fixes stale closure

  // keep ref in sync
  useEffect(() => {
    unlockedRef.current = unlocked;
  }, [unlocked]);

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
        idTokenRef.current = token;
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-IN";

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      sendCommand(text);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
  }, []);

  function speak(text) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function handleCoreTap() {
    if (!recognitionRef.current || listening || busy) return;
    setTranscript("");
    setReply("");
    setListening(true);
    recognitionRef.current.start();
  }

  async function sendCommand(commandText) {
    if (!idTokenRef.current || !commandText.trim()) return;

    const text = commandText.trim().toLowerCase();
    const UNLOCK_PHRASE = "cortex unlock";

    // ========== VOICE PIN (Step 1) ==========
    if (!unlockedRef.current) {
      if (text === UNLOCK_PHRASE || text.includes("cortex unlock")) {
        unlockedRef.current = true;
        setUnlocked(true);
        setReply("Unlocked. Ab boliye kya kaam hai.");
        speak("Unlocked. Ab boliye kya kaam hai.");
        return;
      }

      setReply("Pehle unlock karo. Bolo: cortex unlock");
      speak("Pehle unlock karo. Bolo cortex unlock");
      return;
    }

    // Optional: re-lock
    if (text === "cortex lock" || text.includes("lock cortex")) {
      unlockedRef.current = false;
      setUnlocked(false);
      setReply("Locked.");
      speak("Locked.");
      return;
    }

    // ========== NORMAL COMMAND ==========
    setBusy(true);
    try {
      const response = await fetch("/api/personal/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idTokenRef.current}`,
        },
        body: JSON.stringify({ command: commandText }),
      });

      const payload = await response.json();

      if (!payload.success) {
        const errMsg = payload.error || "Command failed.";
        setReply(`Error: ${errMsg}`);
        speak("Sorry, that command failed.");
        return;
      }

      const spoken =
        payload.result?.message ||
        payload.result?.data?.message ||
        "Done.";
      setReply(spoken);
      speak(spoken);
    } catch (error) {
      setReply(`Error: ${error.message}`);
      speak("Sorry, something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // ==================== LOADING / NOT VERIFIED ====================
  if (state.loading || !state.ownerVerified) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-500 text-sm tracking-widest mb-3">
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

  const activityLabel = listening
    ? "LISTENING"
    : busy
    ? "PROCESSING"
    : unlocked
    ? "ONLINE"
    : "LOCKED";

  // ==================== MAIN CORTEX UI ====================
  return (
    <main className="relative min-h-screen bg-black overflow-hidden flex flex-col items-center justify-center select-none">
      <style>{`
        @keyframes coreRotateSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes coreRotateReverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes corePulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes coreFlicker {
          0%, 100% { opacity: 1; }
          45% { opacity: 0.85; }
          50% { opacity: 1; }
          55% { opacity: 0.7; }
          60% { opacity: 1; }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translateY(100%); opacity: 0; }
        }
        .ultron-ring {
          position: absolute;
          border-radius: 9999px;
          border-style: solid;
        }
        .ultron-plate {
          clip-path: polygon(
            50% 0%, 80% 10%, 100% 35%, 100% 65%,
            80% 90%, 50% 100%, 20% 90%, 0% 65%,
            0% 35%, 20% 10%
          );
        }
      `}</style>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(220,38,38,0.10)_0%,_transparent_65%)]" />

      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,0,0,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,0,0,0.6) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="absolute top-8 left-0 right-0 text-center z-20">
        <p className="text-red-500 text-xs tracking-[0.5em] font-bold [text-shadow:0_0_10px_rgba(220,38,38,0.8)]">
          C O R T E X
        </p>
        <p className="text-gray-500 text-[10px] mt-2 tracking-[0.3em]">
          {activityLabel}
        </p>
      </div>

      <button
        onClick={handleCoreTap}
        disabled={listening || busy}
        className="relative z-10 flex items-center justify-center w-72 h-72 disabled:cursor-default"
        aria-label="Tap to speak to CORTEX"
      >
        <div
          className={`absolute w-72 h-72 rounded-full bg-red-600/25 blur-[60px] ${
            listening ? "animate-ping" : ""
          }`}
          style={{ animationDuration: listening ? "1.4s" : undefined }}
        />
        <div
          className="absolute w-64 h-64 rounded-full bg-red-500/10 blur-2xl"
          style={{ animation: "corePulse 3s ease-in-out infinite" }}
        />

        <div
          className="ultron-ring w-64 h-64 border-red-500/25"
          style={{ borderWidth: "1px", animation: "coreRotateSlow 18s linear infinite" }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_2px_rgba(220,38,38,0.9)]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-500/70 shadow-[0_0_6px_2px_rgba(220,38,38,0.7)]" />
        </div>

        <div
          className="ultron-ring w-56 h-56 border-red-600/20"
          style={{
            borderWidth: "1px",
            borderStyle: "dashed",
            animation: "coreRotateReverse 12s linear infinite",
          }}
        />

        <div
          className="ultron-ring w-48 h-48 border-red-400/30"
          style={{ borderWidth: "2px", animation: "coreRotateSlow 9s linear infinite" }}
        />

        <div
          className="ultron-plate absolute w-40 h-40 bg-gradient-to-br from-neutral-800 via-black to-neutral-900 shadow-[0_0_40px_rgba(220,38,38,0.35)]"
          style={{ animation: "corePulse 4s ease-in-out infinite" }}
        >
          <div className="absolute inset-[6px] ultron-plate bg-gradient-to-br from-red-950 via-black to-neutral-950" />
        </div>

        <div
          className="relative w-24 h-24 rounded-full flex items-center justify-center"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, rgba(255,140,120,0.95), rgba(220,38,38,0.9) 40%, rgba(120,10,10,0.95) 70%, black 100%)",
            boxShadow:
              "0 0 25px 6px rgba(220,38,38,0.75), 0 0 60px 20px rgba(220,38,38,0.35), inset 0 0 20px rgba(0,0,0,0.6)",
            animation: "coreFlicker 2.5s ease-in-out infinite",
          }}
        >
          <div className="w-8 h-8 rounded-full bg-white/70 blur-[3px]" />
        </div>

        <div className="absolute w-40 h-40 overflow-hidden ultron-plate pointer-events-none">
          <div
            className="absolute left-0 right-0 h-10 bg-gradient-to-b from-transparent via-red-300/40 to-transparent"
            style={{ animation: "scanline 2.6s linear infinite" }}
          />
        </div>
      </button>

      <div className="absolute bottom-28 left-0 right-0 z-20 flex flex-col items-center px-6 space-y-2">
        {transcript && (
          <p className="text-xs text-gray-400 max-w-xs text-center">
            <span className="text-red-500 font-semibold">You: </span>
            {transcript}
          </p>
        )}
        {reply && (
          <p className="text-xs text-gray-200 max-w-xs text-center">
            <span className="text-red-500 font-semibold">CORTEX: </span>
            {reply}
          </p>
        )}
      </div>

      <div className="absolute bottom-14 left-0 right-0 text-center z-20">
        <p className="text-gray-500 text-xs tracking-[0.2em]">
          {listening
            ? "Listening…"
            : busy
            ? "Processing…"
            : unlocked
            ? "Tap the core and speak"
            : "Locked — say cortex unlock"}
        </p>
      </div>
    </main>
  );
}