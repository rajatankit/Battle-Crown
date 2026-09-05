"use client";

import { useEffect, useRef, useState } from "react";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

import CortexCore from "./CortexCore";
import VerificationModal from "../../components/cortex/VerificationModal";
import SecuritySetup from "../../components/cortex/SecuritySetup";

// --------------------------------------------------
// SLIDES FEATURE HELPERS (client-side only - this
// entire flow is a plain Battle Crown data operation,
// no Cortex/LLM dispatch needed)
// --------------------------------------------------

function normalizeGameKey(gameRaw) {
  const g = String(gameRaw || "").toLowerCase();
  if (g.includes("bgmi")) return "bgmi";
  return "ff";
}

function parseYesNo(text) {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:'"؟۔]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!t) return null;

  // \~50 flexible yes phrases (English + Hindi + Hinglish)
  const yesList = [
    "yes", "yeah", "yep", "yup", "ya", "yea", "yesh",
    "ok", "okay", "okey", "sure", "surely", "alright", "all right",
    "of course", "go ahead", "do it", "please do", "confirm", "confirmed",
    "affirmative", "right", "correct",
    "haan", "han", "haa", "ha", "hji", "hanji", "haanji",
    "ha ji", "han ji", "haan ji", "ji", "ji haan", "ji han",
    "theek", "theek hai", "thik", "thik hai", "sahi", "sahi hai",
    "bilkul", "bilkul sahi", "pakka", "pakka hai",
    "kar do", "karo", "kar dena", "laga do", "lagao", "laga dena",
    "ho jaaye", "ho jaye", "done karo", "yes karo", "haan karo",
  ];

  // \~50 flexible no phrases (English + Hindi + Hinglish)
  const noList = [
    "no", "nope", "nah", "na", "not", "don't", "dont", "do not",
    "cancel", "stop", "never", "negative", "skip", "later",
    "no need", "not now", "leave it", "forget it", "no thanks", "no thank you",
    "nahi", "nahin", "nhi", "nahii", "nahin", "naa",
    "nahi hai", "nahin hai", "nhi hai",
    "mat", "mat karo", "mat kar", "mat laga", "mat lagao", "mat lagana",
    "nako", "na re", "nahi chahiye", "nahin chahiye", "nhi chahiye",
    "zaroorat nahi", "zarurat nahi", "zaroorat nahin",
    "baad mein", "baad me", "baad", "rehne do", "rehnedo", "rehne de",
    "chhodo", "chhod do", "chhod dena", "leave", "no slides",
    "cancel karo", "cancel it", "nahi bhai", "nahin bhai", "nhi bhai",
  ];

  const sortedYes = [...yesList].sort((a, b) => b.length - a.length);
  const sortedNo = [...noList].sort((a, b) => b.length - a.length);

  for (const p of sortedYes) {
    if (t === p || t.includes(p)) return "yes";
  }
  for (const p of sortedNo) {
    if (t === p || t.includes(p)) return "no";
  }

  // single-letter fallback (speech sometimes returns just y / n)
  if (/^(y|h)$/.test(t)) return "yes";
  if (/^(n)$/.test(t)) return "no";

  return null;
}

function parseSlideSelection(text, count) {
  const t = text.toLowerCase();
  if (/\b(sab|saari|sabhi|all)\b/.test(t)) {
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  const numbers = t.match(/\d+/g);
  if (!numbers) return [];
  const picked = numbers
    .map((n) => parseInt(n, 10))
    .filter((n) => n >= 1 && n <= count);
  return Array.from(new Set(picked));
}

function detectSlidesIntent(text) {
  const t = text.toLowerCase();
  if (!/slide/.test(t)) return null;
  if (!/(lagao|laga do|add|attach|select|dikhao|lagana)/.test(t)) return null;
  const game = t.includes("bgmi") ? "bgmi" : "ff";
  return { game };
}

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

  // null = checking, true = ready, false = need setup
  const [securityReady, setSecurityReady] = useState(null);

  // Verification modal:
  // { requiredVerification, requestId, agentId, remainingSteps } | null
  const [verification, setVerification] = useState(null);

  // Slides gallery: { tournamentId, firestoreId, title, game, options: [{index,url}] } | null
  const [slideGallery, setSlideGallery] = useState(null);

  const recognitionRef = useRef(null);
  const idTokenRef = useRef(null);
  const unlockedRef = useRef(false);
  const phaseRef = useRef(0);

  // Pending yes/no ask after a tournament was just created.
  // { tournamentId, firestoreId, title, game } | null
  const slidesOfferRef = useRef(null);

  // Waiting for the user to say a tournament title (standalone
  // "slides lagao" flow, when we don't already have a target).
  // { game } | null
  const pendingSlidesTitleAskRef = useRef(null);

  useEffect(() => {
    unlockedRef.current = unlocked;
  }, [unlocked]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // --------------------------------------------------
  // ACKNOWLEDGE PENDING HIGH ALERTS (stops escalation pings)
  // --------------------------------------------------

  useEffect(() => {
    if (!state.ownerVerified || !idTokenRef.current) return;

    fetch("/api/cortex/alerts/acknowledge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idTokenRef.current}`,
      },
    }).catch((err) => {
      console.error("Alert acknowledge failed:", err);
    });
  }, [state.ownerVerified]);

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
  // FIREBASE OWNER VERIFICATION + SECURITY STATUS
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
        setSecurityReady(null);
        return;
      }

      user
        .getIdToken()
        .then(async (token) => {
          idTokenRef.current = token;

          try {
            const response = await fetch("/api/personal/status", {
              headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await response.json();

            const ownerOk = Boolean(payload.success);

            setState({
              loading: false,
              message: ownerOk
                ? "CORTEX Online"
                : payload.error || "Secure access check failed.",
              ownerVerified: ownerOk,
              firebaseUid: user.uid,
            });

            if (ownerOk) {
              try {
                const secRes = await fetch("/api/cortex/security/status", {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const sec = await secRes.json();
                setSecurityReady(Boolean(sec?.ready));
              } catch {
                setSecurityReady(false);
              }
            } else {
              setSecurityReady(null);
            }
          } catch {
            setState({
              loading: false,
              message: "Secure access check failed.",
              ownerVerified: false,
              firebaseUid: user.uid,
            });
            setSecurityReady(null);
          }
        })
        .catch(() => {
          setState({
            loading: false,
            message: "Authentication token failed.",
            ownerVerified: false,
            firebaseUid: user.uid,
          });
          setSecurityReady(null);
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
  // SPEAK (server TTS: hi-IN-SwaraNeural, streamed sentence-by-sentence)
  // --------------------------------------------------

  const speechQueueRef = useRef([]);
  const speakingRef = useRef(false);
  const currentAudioRef = useRef(null);

  function splitIntoSentences(text) {
    const cleaned = String(text).trim();
    if (!cleaned) return [];

    const parts = cleaned.match(/[^.!?]+[.!?]*/g) || [cleaned];
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  async function playNextInQueue() {
    if (speakingRef.current) return;
    const next = speechQueueRef.current.shift();
    if (!next) return;

    speakingRef.current = true;

    try {
      const audio = new Audio(`/api/tts?text=${encodeURIComponent(next)}`);
      audio.setAttribute("playsinline", "true");
      audio.volume = 1;
      currentAudioRef.current = audio;

      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });
    } catch {
      // ignore and move on
    } finally {
      speakingRef.current = false;
      currentAudioRef.current = null;
      if (speechQueueRef.current.length > 0) {
        playNextInQueue();
      }
    }
  }

  function speak(text) {
    if (!text?.trim()) return;

    // stop anything currently playing/queued (fresh reply interrupts old one)
    speechQueueRef.current = [];
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    speakingRef.current = false;

    const sentences = splitIntoSentences(text);
    speechQueueRef.current.push(...sentences);
    playNextInQueue();
  }

  // --------------------------------------------------
  // CORE TAP
  // --------------------------------------------------

  function handleCoreTap() {
    // Unlock audio on first user gesture (mobile browsers)
    try {
      const unlock = new Audio(
        "/api/tts?text=" + encodeURIComponent(" ")
      );
      unlock.volume = 0.01;
      unlock
        .play()
        .then(() => {
          unlock.pause();
        })
        .catch(() => {});
    } catch {
      // ignore
    }

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
  // PARSE VERIFICATION_REQUIRED (legacy text-based fallback)
  // Format: VERIFICATION_REQUIRED:fingerprint+face:<requestId>
  // --------------------------------------------------

  function parseVerificationRequired(text) {
    if (!text || typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith("VERIFICATION_REQUIRED:")) return null;

    const parts = trimmed.split(":");
    if (parts.length < 3) return null;

    const requiredVerification = parts[1];
    const requestId = parts.slice(2).join(":");

    if (!requiredVerification || !requestId) return null;
    return { requiredVerification, requestId };
  }

  // A "high" risk step needs the fuller fingerprint+face check;
  // anything else falls back to a single fingerprint step. Used
  // when the backend gives us a structured risk level instead of
  // (or in addition to) the legacy VERIFICATION_REQUIRED text.
  function verificationLevelForRisk(risk) {
    return risk === "high" ? "fingerprint+face" : "fingerprint";
  }

  // Given a full API response payload (from either /api/personal/command
  // or a chain-resume call), figures out whether it's asking for approval
  // and returns everything VerificationModal needs — or null if not.
  function extractApprovalRequest(payload) {
    const result = payload?.result || {};
    const requiresApproval =
      payload?.requires_approval === true || result?.requires_approval === true;

    if (!requiresApproval) return null;

    const spoken = String(result?.message || payload?.message || "");
    const legacy = parseVerificationRequired(spoken);

    const requiredVerification =
      legacy?.requiredVerification || verificationLevelForRisk(result?.risk);

    const requestId = legacy?.requestId || result?.request_id || null;
    const agentId = result?.agent_id || payload?.agent_id || "cortex";

    if (!requestId) return null;

    return {
      requiredVerification,
      requestId,
      agentId,
      remainingSteps: Array.isArray(result?.remaining_steps)
        ? result.remaining_steps
        : null,
    };
  }

  // --------------------------------------------------
  // SLIDES: load gallery for a target tournament+game
  // --------------------------------------------------

  async function loadSlideGallery(target) {
    try {
      const res = await fetch(
        `/api/slides?game=${encodeURIComponent(target.game)}&limit=12`
      );
      const payload = await res.json();

      if (!payload.success || !Array.isArray(payload.slides) || payload.slides.length === 0) {
        setReply(`Boss, ${target.game.toUpperCase()} ki slides Cloudinary mein nahi mili.`);
        speak("Slides nahi mili.");
        return;
      }

      const options = payload.slides.map((s, i) => ({ index: i + 1, url: s.url }));
      setSlideGallery({ ...target, options });

      const msg = `Ye rahi ${target.game.toUpperCase()} slides, Boss. Number boliye jaise "1 aur 3", ya "sab" bolke saari rakh sakte hain.`;
      setReply(msg);
      speak(msg);
    } catch (err) {
      setReply("Slides load karte waqt error aaya, Boss.");
      speak("Slides load nahi ho payi.");
    }
  }

  // --------------------------------------------------
  // COMMAND PROCESSING
  // --------------------------------------------------

  async function sendCommand(commandText) {
    if (!idTokenRef.current || !commandText?.trim()) return;

    const text = commandText.trim().toLowerCase();

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

    if (phaseRef.current < 6) {
      setReply("Activation in progress. Stand by, Boss.");
      return;
    }

    if (text.includes("cortex lock") || text.includes("cortex, lock")) {
      unlockedRef.current = false;
      setUnlocked(false);
      setPhase(0);
      setReply("Systems locked.");
      speak("Systems locked.");
      return;
    }

    // ---- Slide gallery active: user is picking numbers ----
    if (slideGallery) {
      const picks = parseSlideSelection(text, slideGallery.options.length);
      if (picks.length === 0) {
        setReply('Boss, number boliye jaise "1 aur 3", ya "sab".');
        speak("Number boliye ya sab boliye.");
        return;
      }

      const urls = picks
        .map((i) => slideGallery.options.find((o) => o.index === i)?.url)
        .filter(Boolean);

      setBusy(true);
      try {
        const res = await fetch("/api/personal/slides/attach", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idTokenRef.current}`,
          },
          body: JSON.stringify({
            firestoreId: slideGallery.firestoreId,
            slides: urls,
          }),
        });
        const payload = await res.json();

        const title = slideGallery.title;
        setSlideGallery(null);
        slidesOfferRef.current = null;

        if (payload.success) {
          const msg = `Slides laga di, Boss — "${title}" par \( {urls.length} slide \){urls.length > 1 ? "s" : ""} live hain.`;
          setReply(msg);
          speak(msg);
        } else {
          setReply(`Boss, slides lagane mein dikkat aayi: ${payload.error || "unknown error"}`);
          speak("Slides lagane mein dikkat aayi.");
        }
      } catch (err) {
        setReply("Slides save karte waqt error aaya, Boss.");
        speak("Error aaya slides save karte waqt.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // ---- Pending yes/no offer after tournament creation ----
    if (slidesOfferRef.current) {
      const answer = parseYesNo(text);
      const target = slidesOfferRef.current;

      if (answer === "no") {
        slidesOfferRef.current = null;
        setReply("Theek hai Boss, slides baad mein laga lenge.");
        speak("Theek hai Boss.");
        return;
      }

      if (answer === "yes") {
        setBusy(true);
        await loadSlideGallery(target);
        setBusy(false);
        return;
      }

      setReply('Boss, "haan" ya "nahi" boliye.');
      speak("Haan ya nahi boliye.");
      return;
    }

    // ---- Waiting for a tournament title (standalone slides flow) ----
    if (pendingSlidesTitleAskRef.current) {
      const game = pendingSlidesTitleAskRef.current.game;
      pendingSlidesTitleAskRef.current = null;

      setBusy(true);
      try {
        const res = await fetch("/api/personal/slides/find-tournament", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idTokenRef.current}`,
          },
          body: JSON.stringify({ title: commandText.trim() }),
        });
        const payload = await res.json();

        if (!payload.success) {
          setReply(`Boss, "${commandText.trim()}" naam ka tournament nahi mila.`);
          speak("Tournament nahi mila.");
          setBusy(false);
          return;
        }

        await loadSlideGallery({
          tournamentId: payload.tournament.tournamentId,
          firestoreId: payload.tournament.firestoreId,
          title: payload.tournament.title,
          game,
        });
      } catch (err) {
        setReply("Tournament dhoondhte waqt error aaya, Boss.");
        speak("Error aaya.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // ---- Standalone "slides lagao" trigger ----
    const slidesIntent = detectSlidesIntent(text);
    if (slidesIntent) {
      pendingSlidesTitleAskRef.current = { game: slidesIntent.game };
      setReply("Boss, kis tournament ke liye? Title boliye.");
      speak("Kis tournament ke liye, title boliye.");
      return;
    }

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
        const approval = extractApprovalRequest(payload);
        if (approval) {
          setReply(
            approval.requiredVerification === "fingerprint+face"
              ? "High risk. Biometric + pattern verification required, Boss."
              : "Verification required, Boss."
          );
          speak(
            approval.requiredVerification === "fingerprint+face"
              ? "High risk command. Identity verification required."
              : "Identity verification required."
          );
          setVerification(approval);
          return;
        }

        setReply(`Error: ${payload.error || "Command failed."}`);
        speak("Command failed, Boss.");
        return;
      }

      const spoken =
        payload.result?.message ||
        payload.result?.data?.message ||
        payload.message ||
        "Done, Boss.";

      const clean = String(spoken).trim();

      setReply(clean);
      speak(clean);
    } catch (error) {
      setReply(`Error: ${error?.message || "Something went wrong."}`);
      speak("Something went wrong, Boss.");
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // VERIFICATION HANDLERS
  // --------------------------------------------------

  function handleVerificationSuccess(data) {
    // The chain may have stopped again because the step right after
    // this one also needs approval — in that case, reopen the modal
    // with the new details instead of closing it.
    const nextApproval = extractApprovalRequest(data);
    if (nextApproval) {
      setVerification(nextApproval);
      setReply(
        nextApproval.requiredVerification === "fingerprint+face"
          ? "High risk. Biometric + pattern verification required, Boss."
          : "Verification required, Boss."
      );
      speak("Next step also needs verification, Boss.");
      return;
    }

    setVerification(null);

    // If this approval just created a tournament, offer to attach
    // slides right away (the Python create_tournament tool returns
    // {status:"created", tournament: {tournament_id, firestore_id,
    // title, game, ...}} nested under result.data).
    const createdTournament = data?.result?.data?.tournament;

    const spoken =
      data?.result?.message ||
      data?.result?.data?.message ||
      data?.message ||
      "Approved and done, Boss.";

    const clean = String(spoken).trim();

    if (createdTournament?.firestore_id) {
      slidesOfferRef.current = {
        tournamentId: createdTournament.tournament_id,
        firestoreId: createdTournament.firestore_id,
        title: createdTournament.title,
        game: normalizeGameKey(createdTournament.game),
      };
      const combined = `${clean} Iske liye slides lagani hain kya, Boss?`;
      setReply(combined);
      speak(combined);
      return;
    }

    setReply(clean);
    speak(clean);
  }

  function handleVerificationCancel() {
    setVerification(null);
    setReply("Verification cancelled, Boss.");
    speak("Verification cancelled.");
  }

  async function refreshSecurityStatus() {
    try {
      const secRes = await fetch("/api/cortex/security/status", {
        headers: {
          Authorization: `Bearer ${idTokenRef.current}`,
        },
      });
      const sec = await secRes.json();
      setSecurityReady(Boolean(sec?.ready));
    } catch {
      setSecurityReady(false);
    }
  }

  // --------------------------------------------------
  // SCREENS
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

  if (securityReady === null) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-6">
        <p className="text-gray-400 text-sm tracking-[0.35em]">
          Checking security setup…
        </p>
      </main>
    );
  }

  if (securityReady === false) {
    return (
      <SecuritySetup
        authToken={idTokenRef.current}
        onComplete={refreshSecurityStatus}
      />
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
    : slideGallery
    ? "SELECTING SLIDES"
    : "ONLINE";

  return (
    <main className="relative min-h-screen bg-black overflow-hidden flex flex-col items-center justify-center select-none">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            phase >= 1
              ? `radial-gradient(circle at center, rgba(150,0,0,${
                  0.05 + phase * 0.018
                }) 0%, rgba(70,0,0,0.035) 30%, transparent 67%)`
              : `radial-gradient(circle at center, rgba(30,0,0,0.035) 0%, transparent 60%)`,
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

      {!slideGallery && (
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
          <CortexCore phase={phase} unlocked={unlocked} listening={listening} />
        </button>
      )}

      {slideGallery && (
        <div className="relative z-20 w-full max-w-sm px-6">
          <div className="grid grid-cols-4 gap-2">
            {slideGallery.options.map((opt) => (
              <div key={opt.index} className="relative">
                <img
                  src={opt.url}
                  alt={`slide ${opt.index}`}
                  className="w-full h-16 object-cover rounded border border-red-900"
                />
                <span className="absolute top-0 left-0 bg-black/70 text-red-400 text-[10px] px-1 rounded-br">
                  {opt.index}
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleCoreTap}
            disabled={listening || busy}
            className="mt-4 w-full rounded-full py-3 text-xs tracking-[0.2em]"
            style={{
              border: "1px solid #ff2a10",
              color: "#ff6a55",
              background: "transparent",
            }}
          >
            {listening ? "LISTENING…" : "TAP AND SPEAK YOUR PICK"}
          </button>
        </div>
      )}

      <div className="absolute bottom-28 left-0 right-0 z-30 flex flex-col items-center px-6 space-y-2 pointer-events-none">
        {transcript && (
          <p className="text-xs text-gray-400 max-w-xs text-center">
            <span className="text-red-500 font-semibold">You:</span>{" "}
            {transcript}
          </p>
        )}
        {reply && (
          <p className="text-xs text-gray-200 max-w-sm text-center">
            <span className="text-red-500 font-semibold">CORTEX:</span> {reply}
          </p>
        )}
      </div>

      <div className="absolute bottom-14 left-0 right-0 text-center z-30 pointer-events-none">
        <p className="text-gray-500 text-xs tracking-[0.2em]">
          {!unlocked
            ? "Locked — say cortex unlock"
            : phase < 6
            ? "Activation sequence in progress…"
            : verification
            ? "Identity verification in progress…"
            : slideGallery
            ? "Tap the button above and speak your pick"
            : listening
            ? "Listening…"
            : busy
            ? "Processing…"
            : full
            ? "Tap the core and speak"
            : ""}
        </p>
      </div>

      {verification && (
        <VerificationModal
          requiredVerification={verification.requiredVerification}
          requestId={verification.requestId}
          agentId={verification.agentId}
          remainingSteps={verification.remainingSteps}
          authToken={idTokenRef.current}
          onSuccess={handleVerificationSuccess}
          onCancel={handleVerificationCancel}
        />
      )}
    </main>
  );
}