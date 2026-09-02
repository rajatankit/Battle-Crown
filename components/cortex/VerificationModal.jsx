"use client";

import { useState, useCallback, useRef } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import PatternLock from "./PatternLock";

function stepsFor(requiredVerification) {
  if (requiredVerification === "fingerprint+face") {
    return ["biometric", "biometric", "pattern"];
  }
  if (requiredVerification === "fingerprint") {
    return ["biometric"];
  }
  return ["biometric"];
}

export default function VerificationModal({
  requiredVerification,
  requestId,
  agentId,
  authToken,
  // NEW: the full remaining_steps array from the requires_approval
  // response (the currently-blocking step is remainingSteps[0]).
  // Optional — single-step approvals work exactly as before if omitted.
  remainingSteps,
  onSuccess,
  onCancel,
}) {
  const [steps] = useState(() => stepsFor(requiredVerification));
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Guards against finish() (the /approve call) ever firing more than
  // once for this modal instance — e.g. a double-tap on "Tap to
  // Verify" landing before the button re-renders as disabled. A ref
  // is used (not state) because it must block the second call
  // synchronously, before React has a chance to re-render.
  const approvedRef = useRef(false);

  const authHeaders = useCallback(() => {
    const h = { "Content-Type": "application/json" };
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const finish = useCallback(async () => {
    if (approvedRef.current) return;
    approvedRef.current = true;

    setFinishing(true);
    try {
      // Step 1: approve the actual pending action on the backend
      // (unchanged from before).
      const res = await fetch("/api/personal/command/approve", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          request_id: requestId,
          agent_id: agentId,
          verified: true,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data?.error || "Approval failed.");
      }

      // Step 2: if this was part of a multi-step chain and there are
      // steps after this one, resume the chain — skipping the LLM
      // entirely by sending back the exact remaining steps.
      const stepsAfterThis =
        Array.isArray(remainingSteps) && remainingSteps.length > 1
          ? remainingSteps.slice(1)
          : null;

      if (stepsAfterThis) {
        const resumeRes = await fetch("/api/personal/command", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            approved: true,
            remaining_steps: stepsAfterThis,
          }),
        });
        const resumeData = await resumeRes.json();

        if (!resumeRes.ok || !resumeData.success) {
          // The chain may have stopped again because the NEXT step
          // also needs approval. Hand that back to the parent as-is
          // (via onSuccess) so it can decide whether to open another
          // VerificationModal for the next step — this component
          // does not loop on its own.
          onSuccess({ ...resumeData, chained_from: data });
          return;
        }

        onSuccess({ ...resumeData, chained_from: data });
        return;
      }

      onSuccess(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
      setFinishing(false);
      // Allow a retry after a genuine failure (network error, backend
      // rejected it, etc.) — only successful completion should stay
      // permanently locked.
      approvedRef.current = false;
    }
  }, [requestId, agentId, remainingSteps, onSuccess, authHeaders]);

  const advance = useCallback(() => {
    setStepIndex((prev) => {
      const next = prev + 1;
      if (next >= steps.length) {
        finish();
      }
      return next;
    });
  }, [steps.length, finish]);

  const runBiometricStep = useCallback(async () => {
    if (busy || finishing || approvedRef.current) return;
    setBusy(true);
    setError("");
    try {
      const optionsRes = await fetch("/api/cortex/security/auth-options", {
        headers: authHeaders(),
      });
      const options = await optionsRes.json();
      if (!optionsRes.ok) {
        throw new Error(options?.error || "Biometric not set up.");
      }

      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/cortex/security/auth-verify", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(assertion),
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData?.error || "Biometric verification failed.");
      }

      advance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Biometric step failed.");
    } finally {
      setBusy(false);
    }
  }, [busy, finishing, advance, authHeaders]);

  const runPatternStep = useCallback(
    async (patternString) => {
      if (busy || finishing || approvedRef.current) return;
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/cortex/security/pattern-verify", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ pattern: patternString }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data?.error || "Pattern incorrect.");
        }

        advance();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Pattern step failed.");
      } finally {
        setBusy(false);
      }
    },
    [busy, finishing, advance, authHeaders]
  );

  const currentStep = steps[stepIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          border: "1px solid #4a0400",
          backgroundColor: "#000",
          boxShadow: "0 0 40px rgba(255,0,0,0.25)",
        }}
      >
        <h2
          className="mb-1 text-center text-lg font-bold tracking-widest"
          style={{ color: "#ff3b30" }}
        >
          IDENTITY VERIFICATION
        </h2>
        <p className="mb-6 text-center text-xs text-gray-500">
          {finishing
            ? "Finalizing..."
            : `Step ${Math.min(stepIndex + 1, steps.length)} of ${steps.length}`}
        </p>

        {!finishing && currentStep === "biometric" && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-gray-300 text-center">
              Boss, apna fingerprint ya face verify karo.
            </p>
            <button
              disabled={busy || finishing}
              onClick={runBiometricStep}
              className="rounded-full px-6 py-3 disabled:opacity-50"
              style={{
                border: "1px solid #ff2a10",
                color: "#ff6a55",
                background: "transparent",
              }}
            >
              {busy ? "Verifying..." : "Tap to Verify"}
            </button>
          </div>
        )}

        {!finishing && currentStep === "pattern" && (
          <PatternLock onComplete={runPatternStep} />
        )}

        {error && (
          <p className="mt-4 text-center text-xs" style={{ color: "#ff3b30" }}>
            {error}
          </p>
        )}

        <button
          onClick={onCancel}
          disabled={finishing}
          className="mt-6 w-full text-center text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}