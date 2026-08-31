"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  auth,
} from "../lib/firebase";

import {
  onAuthStateChanged,
} from "firebase/auth";

import CortexCore from "./CortexCore";
import VerificationModal from "../../components/cortex/VerificationModal";

const ACTIVATION_DURATION = 60000;

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
  const [phase, setPhase] = useState(0);

  // Verification modal state
  const [verification, setVerification] = useState(null);
  // { requiredVerification, requestId, agentId } | null

  const recognitionRef = useRef(null);
  const idTokenRef = useRef(null);
  const unlockedRef = useRef(false);
  const phaseRef = useRef(0);

  useEffect(() => {
    unlockedRef.current = unlocked;
  }, [unlocked]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // --------------------------------------------------
  // 60 SECOND CINEMATIC ACTIVATION
  // --------------------------------------------------

  useEffect(() => {
    if (!unlocked) {
      setPhase(0);
      try {
        sessionStorage.removeItem("cortex_unlock_ts");
      } catch {
        // ignore
      }
      return;
    }

    let startTs = null;
    try {
      startTs = Number(sessionStorage.getItem("cortex_unlock_ts"));
    } catch {
      startTs = null;
    }

    if (!startTs) {
      startTs = Date.now();
      try {
        sessionStorage.setItem("cortex_unlock_ts", String(startTs));
      } catch {
        // ignore
      }
    }

    const tick = () => {
      const elapsed = Date.now() - startTs;
      const newPhase = Math.min(6, Math.floor(elapsed / 10000));

      setPhase((prev) => {
        if (newPhase !== prev) {
          console.log("[CORTEX] phase ->", newPhase, "elapsed:", elapsed);
        }
        return newPhase;
      });

      if (newPhase >= 6) {
        setReply("CORTEX ACTIVATED.");
        speak("CORTEX ACTIVATED.");
        return true;
      }
      return false;
    };

    const doneImmediately = tick();
    if (doneImmediately) return;

    const interval = setInterval(() => {
      const done = tick();
      if (done) clearInterval(interval);
    }, 500);

    return () => clearInterval(interval);
  }, [unlocked]);

  // --------------------------------------------------
  // FIREBASE OWNER VERIFICATION
  // --------------------------------------------------

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

      user
        .getIdToken()
        .then(async (token) => {
          idTokenRef.current = token;

          try {
            const response = await fetch("/api/personal/status", {
              headers: {
                Authorization: `Bearer ${token}`,
              },
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
        })
        .catch(() => {
          setState({
            loading: false,
            message: "Authentication token failed.",
            ownerVerified: false,
            firebaseUid: user.uid,
          });
        });
    });

    return unsubscribe;
  }, []);

  // --------------------------------------------------
  // SPEECH RECOGNITION
  // --------------------------------------------------

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
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

    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  // --------------------------------------------------
  // SPEAK
  // --------------------------------------------------

  function speak(text) {
    if (typeof window === "undefined") return;
    if (!window.speechSynthesis) return;
    if (!text?.trim()) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(String(text).trim());
    utterance.lang = "en-US";
    utterance.rate = 0.82;
    utterance.pitch = 0.48;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (voice) =>
        /david|mark|guy|alex|daniel/i.test(voice.name) &&
        voice.lang.startsWith("en")
    );
    const american = voices.find((voice) => voice.lang === "en-US");
    const english = voices.find((voice) => voice.lang.startsWith("en"));
    const selectedVoice = preferred || american || english;

    if (selectedVoice) utterance.voice = selectedVoice;

    window.speechSynthesis.speak(utterance);
  }

  // --------------------------------------------------
  // CORE TAP
  // --------------------------------------------------

  function handleCoreTap() {
    if (!recognitionRef.current || listening || busy || verification) {
      return;
    }

    if (unlocked && phase < 6) return;

    setTranscript("");
    setReply("");
    setListening(true);

    try {
      recognitionRef.current.start();
    } catch {
      setListening(false);
    }
  }

  // --------------------------------------------------
  // PARSE VERIFICATION_REQUIRED MESSAGE
  // Format: VERIFICATION_REQUIRED:fingerprint+face:<requestId>
  // --------------------------------------------------

  function parseVerificationRequired(text) {
    if (!text || typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith("VERIFICATION_REQUIRED:")) return null;

    const parts = trimmed.split(":");
    // VERIFICATION_REQUIRED : type : uuid
    if (parts.length < 3) return null;

    const requiredVerification = parts[1]; // fingerprint | fingerprint+face
    const requestId = parts.slice(2).join(":"); // rest is uuid

    if (!requiredVerification || !requestId) return null;

    return { requiredVerification, requestId };
  }

  // --------------------------------------------------
  // COMMAND PROCESSING
  // --------------------------------------------------

  async function sendCommand(commandText) {
    if (!idTokenRef.current || !commandText?.trim()) return;

    const text = commandText.trim().toLowerCase();

    // LOCKED
    if (!unlockedRef.current) {
      if (
        text.includes("cortex unlock") ||
        text.includes("cortex, unlock")
      ) {
        unlockedRef.current = true;
        setUnlocked(true);
        setPhase(0);
        setReply("Activation sequence initiated.");
        return;
      }

      setReply("Access denied. Say: cortex unlock");
      speak("Access denied. Say cortex unlock");
      return;
    }

    // ACTIVATING
    if (phaseRef.current < 6) {
      setReply("Activation in progress. Stand by, Boss.");
      return;
    }

    // LOCK
    if (text.includes("cortex lock") || text.includes("cortex, lock")) {
      unlockedRef.current = false;
      setUnlocked(false);
      setPhase(0);
      setReply("Systems locked.");
      speak("Systems locked.");
      return;
    }

    // NORMAL COMMAND
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
        const errorMessage = `Error: ${payload.error || "Command failed."}`;
        setReply(errorMessage);
        speak("Command failed, Boss.");
        return;
      }

      const spoken =
        payload.result?.message ||
        payload.result?.data?.message ||
        payload.message ||
        "Done, Boss.";

      const clean = String(spoken).trim();

      // ---- VERIFICATION GATE ----
      const verificationInfo = parseVerificationRequired(clean);

      if (verificationInfo) {
        const agentId =
          payload.result?.agent_id ||
          payload.agent_id ||
          payload.result?.data?.agent_id ||
          "cortex";

        setReply(
          verificationInfo.requiredVerification === "fingerprint+face"
            ? "High risk. Biometric + pattern verification required, Boss."
            : "Verification required, Boss."
        );
        speak(
          verificationInfo.requiredVerification === "fingerprint+face"
            ? "High risk command. Identity verification required."
            : "Identity verification required."
        );

        setVerification({
          requiredVerification: verificationInfo.requiredVerification,
          requestId: verificationInfo.requestId,
          agentId,
        });
        return;
      }

      setReply(clean);
      speak(clean);
    } catch (error) {
      const message = error?.message || "Something went wrong.";
      setReply(`Error: ${message}`);
      speak("Something went wrong, Boss.");
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // VERIFICATION SUCCESS / CANCEL
  // --------------------------------------------------

  function handleVerificationSuccess(data) {
    setVerification(null);

    const spoken =
      data?.result?.message ||
      data?.result?.data?.message ||
      data?.message ||
      "Approved and done, Boss.";

    const clean = String(spoken).trim();
    setReply(clean);
    speak(clean);
  }

  function handleVerificationCancel() {
    setVerification(null);
    setReply("Verification cancelled, Boss.");
    speak("Verification cancelled.");
  }

  // --------------------------------------------------
  // LOADING / ACCESS SCREEN
  // --------------------------------------------------

  if (state.loading || !state.ownerVerified) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-500 text-sm tracking-[0.4em] mb-3">
            PERSONAL COMMAND CENTER
          </p>
          <p className="text-gray-300 text-sm">{state.message}</p>
        </div>
      </main>
    );
  }

  const full = phase >= 6;

  const activityLabel = !unlocked
    ? "LOCKED"
    : phase < 6
    ? "ACTIVATING"
    : listening
    ? "LISTENING"
    : busy
    ? "PROCESSING"
    : verification
    ? "VERIFYING"
    : "ONLINE";

  return (
    <main className="relative min-h-screen bg-black overflow-hidden flex flex-col items-center justify-center select-none">
      {/* Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            phase >= 1
              ? `
                radial-gradient(
                  circle at center,
                  rgba(150,0,0,${0.05 + phase * 0.018}) 0%,
                  rgba(70,0,0,0.035) 30%,
                  transparent 67%
                )
              `
              : `
                radial-gradient(
                  circle at center,
                  rgba(30,0,0,0.035) 0%,
                  transparent 60%
                )
              `,
          transition: "background 2s ease",
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, transparent 30%, rgba(0,0,0,0.68) 100%)",
        }}
      />

      {/* Header */}
      <div className="absolute top-8 left-0 right-0 text-center z-30 pointer-events-none">
        <p
          className="text-red-500 text-xs tracking-[0.55em] font-bold"
          style={{ textShadow: "0 0 12px rgba(220,38,38,0.85)" }}
        >
          C O R T E X
        </p>
        <p
          className={`text-[10px] mt-2 tracking-[0.35em] ${
            unlocked ? "text-red-400/80" : "text-gray-600"
          }`}
        >
          {activityLabel}
        </p>
      </div>

      {/* Core */}
      <button
        type="button"
        onClick={handleCoreTap}
        disabled={
          listening || busy || !!verification || (unlocked && phase < 6)
        }
        aria-label="Cortex Core"
        className="relative z-20 flex items-center justify-center focus:outline-none disabled:cursor-default"
        style={{
          width: "min(92vw, 620px)",
          height: "min(92vw, 620px)",
          minHeight: "360px",
          minWidth: "360px",
          maxWidth: "620px",
          maxHeight: "620px",
          perspective: "1200px",
        }}
      >
        <CortexCore
          phase={phase}
          unlocked={unlocked}
          listening={listening}
        />
      </button>

      {/* Transcript / Reply */}
      <div className="absolute bottom-28 left-0 right-0 z-30 flex flex-col items-center px-6 space-y-2 pointer-events-none">
        {transcript && (
          <p className="text-xs text-gray-400 max-w-xs text-center">
            <span className="text-red-500 font-semibold">You:</span>{" "}
            {transcript}
          </p>
        )}

        {reply && (
          <p className="text-xs text-gray-200 max-w-sm text-center">
            <span className="text-red-500 font-semibold">CORTEX:</span>{" "}
            {reply}
          </p>
        )}
      </div>

      {/* Bottom status */}
      <div className="absolute bottom-14 left-0 right-0 text-center z-30 pointer-events-none">
        <p className="text-gray-500 text-xs tracking-[0.2em]">
          {!unlocked
            ? "Locked — say cortex unlock"
            : phase < 6
            ? "Activation sequence in progress…"
            : verification
            ? "Identity verification in progress…"
            : listening
            ? "Listening…"
            : busy
            ? "Processing…"
            : full
            ? "Tap the core and speak"
            : ""}
        </p>
      </div>

      {/* Verification Modal */}
      {verification && (
        <VerificationModal
          requiredVerification={verification.requiredVerification}
          requestId={verification.requestId}
          agentId={verification.agentId}
          authToken={idTokenRef.current}
          onSuccess={handleVerificationSuccess}
          onCancel={handleVerificationCancel}
        />
      )}
    </main>
  );
}
