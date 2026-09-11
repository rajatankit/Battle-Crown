"use client";

import { useState, useRef } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import PatternLock from "./PatternLock";
import { recordWavSample } from "@/app/lib/client/wavRecorder";

export default function SecuritySetup({ authToken, onComplete }) {
  const [status, setStatus] = useState("");
  const [settingPattern, setSettingPattern] = useState(false);
  const [biometricDone, setBiometricDone] = useState(false);
  const [patternDone, setPatternDone] = useState(false);

  const [voiceDone, setVoiceDone] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [voiceSampleCount, setVoiceSampleCount] = useState(0);

  const voiceSamplesRef = useRef([]);

  const headers = () => {
    const h = { "Content-Type": "application/json" };
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  };

  const registerBiometric = async () => {
    setStatus("Requesting biometric registration...");
    try {
      const optionsRes = await fetch("/api/cortex/security/register-options", {
        headers: headers(),
      });
      const options = await optionsRes.json();
      if (!optionsRes.ok) {
        throw new Error(options?.error || "Failed to get options.");
      }

      const attestation = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/cortex/security/register-verify", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(attestation),
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData?.error || "Registration failed.");
      }

      setBiometricDone(true);
      setStatus("Biometric registered successfully.");
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  };

  const savePattern = async (patternString) => {
    setStatus("Saving pattern...");
    try {
      const res = await fetch("/api/cortex/security/pattern-set", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ pattern: patternString }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || "Failed to save pattern.");
      }
      setPatternDone(true);
      setStatus("Pattern saved.");
      setSettingPattern(false);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    }
  };

  // --------------------------------------------------
  // VOICE ENROLLMENT — record 3 samples, then submit
  // --------------------------------------------------

  const recordOneSample = (durationMs = 3000) => {
    return recordWavSample(durationMs);
  };

  const startVoiceEnrollment = async () => {
    setRecordingVoice(true);
    setVoiceSampleCount(0);
    voiceSamplesRef.current = [];
    setStatus("");

    try {
      for (let i = 1; i <= 3; i++) {
        setStatus(`Sample ${i}/3 — 3 second bolo (jaise "cortex unlock")...`);
        const blob = await recordOneSample(3000);
        voiceSamplesRef.current.push(blob);
        setVoiceSampleCount(i);
      }

      setStatus("Voice samples upload ho rahi hain...");

      const formData = new FormData();
      voiceSamplesRef.current.forEach((blob, idx) => {
        formData.append("samples", blob, `sample-${idx}.wav`);
      });

      const authHeaders = {};
      if (authToken) authHeaders.Authorization = `Bearer ${authToken}`;

      const res = await fetch("/api/cortex/security/voice/enroll", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data?.error || "Voice enrollment failed.");
      }

      setVoiceDone(true);
      setStatus("Voice profile enroll ho gayi.");
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setRecordingVoice(false);
    }
  };

  const allDone = biometricDone && patternDone && voiceDone;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
    >
      <div
        className="w-full max-w-sm space-y-6 rounded-2xl p-6 text-center"
        style={{
          border: "1px solid #4a0400",
          backgroundColor: "#000",
          boxShadow: "0 0 40px rgba(255,0,0,0.25)",
        }}
      >
        <h2
          className="text-lg font-bold tracking-widest"
          style={{ color: "#ff3b30" }}
        >
          CORTEX SECURITY SETUP
        </h2>
        <p className="text-xs text-gray-500">
          Ek baar setup karo — fingerprint/face + pattern + voice. Uske baad high-risk commands verify hongi.
        </p>

        <button
          onClick={registerBiometric}
          className="w-full rounded-full py-3"
          style={{ border: "1px solid #ff2a10", color: "#ff6a55" }}
        >
          {biometricDone ? "Biometric ✓ Registered" : "1. Register Fingerprint / Face"}
        </button>

        {!settingPattern ? (
          <button
            onClick={() => setSettingPattern(true)}
            className="w-full rounded-full py-3"
            style={{ border: "1px solid #ff2a10", color: "#ff6a55" }}
          >
            {patternDone ? "Pattern ✓ Saved" : "2. Set Pattern Lock"}
          </button>
        ) : (
          <PatternLock onComplete={savePattern} label="Set your pattern" />
        )}

        <button
          onClick={startVoiceEnrollment}
          disabled={recordingVoice}
          className="w-full rounded-full py-3 disabled:opacity-50"
          style={{ border: "1px solid #ff2a10", color: "#ff6a55" }}
        >
          {voiceDone
            ? "Voice ✓ Enrolled"
            : recordingVoice
            ? `Recording... (${voiceSampleCount}/3)`
            : "3. Enroll Voice (3 samples)"}
        </button>

        {status && <p className="text-xs text-gray-400">{status}</p>}

        {allDone && (
          <button
            onClick={() => onComplete && onComplete()}
            className="w-full rounded-full py-3 font-semibold"
            style={{ backgroundColor: "#ff2a10", color: "#000" }}
          >
            Setup Complete — Continue
          </button>
        )}
      </div>
    </div>
  );
}