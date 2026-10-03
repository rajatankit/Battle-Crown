"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../lib/firebase"; // path adjust karo agar alag ho
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { requestNotificationPermission } from "../lib/firebase-messaging";

export default function AuthPage() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const clearMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const switchMode = (loginMode) => {
    setIsLoginMode(loginMode);
    clearMessages();
    setPassword("");
    setConfirmPassword("");
  };

  // ── Login ──────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        identifier.trim(),
        password
      );
      const user = userCredential.user;

      if (!user.emailVerified) {
        setErrorMessage(
          "❌ Email not verified. Check your inbox and verify before logging in."
        );
        await signOut(auth);
        return;
      }

      setSuccessMessage("✅ Login successful! Entering arena...");

      // FCM — non-blocking
      try {
        const fcmToken = await requestNotificationPermission();
        if (fcmToken) {
          const idToken = await user.getIdToken();
          const fcmRes = await fetch("/api/user/update-fcm", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ fcmToken }),
          });
          if (!fcmRes.ok) {
            console.error("FCM update failed:", fcmRes.status);
          }
        }
      } catch (fcmErr) {
        console.error("FCM error (non-fatal):", fcmErr);
      }

      setTimeout(() => router.push("/dashboard"), 800);
    } catch (error) {
      console.error("Login error:", error);
      const msg =
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found"
          ? "❌ Invalid email or password."
          : `❌ ${error.message}`;
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Create Account ─────────────────────────────────────────────────────
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    clearMessages();

    if (!password || !confirmPassword) {
      setErrorMessage("❌ Please fill in both password fields.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("❌ Passwords do not match!");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("❌ Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        identifier.trim(),
        password
      );
      const user = userCredential.user;

      const idToken = await user.getIdToken();
      const dbResponse = await fetch("/api/user/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          name: "Player",
        }),
      });

      const dbData = await dbResponse.json().catch(() => ({}));
      if (!dbResponse.ok || dbData.success === false) {
        throw new Error(dbData.error || dbData.message || "Failed to save user");
      }

      await sendEmailVerification(user);
      await signOut(auth);

      setSuccessMessage(
        "✅ Account created! Verification email sent. Verify your email, then login."
      );
      setPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        switchMode(true);
      }, 3500);
    } catch (error) {
      console.error("Create account error:", error);
      let msg = error.message;
      if (error.code === "auth/email-already-in-use") {
        msg = "This email is already registered. Please login.";
      } else if (error.code === "auth/weak-password") {
        msg = "Password is too weak. Use at least 6 characters.";
      }
      setErrorMessage(`❌ ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0b0f17] text-white flex items-center justify-center p-4">
      <div className="bg-[#0f141c]/95 border border-cyan-500/40 p-8 rounded-xl max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <h1 className="text-xl font-black tracking-tight italic">
            BATTLE <span className="text-cyan-400">CROWN</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            {isLoginMode
              ? "// AGENT LOGIN PORTAL"
              : "// CREATE NEW AGENT ACCOUNT"}
          </p>
        </div>

        {errorMessage && (
          <div className="bg-red-500/15 border border-red-500/50 text-red-400 text-sm p-3 rounded mb-4 leading-relaxed">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="bg-green-500/15 border border-green-500/50 text-green-400 text-sm p-3 rounded mb-4 leading-relaxed">
            {successMessage}
          </div>
        )}

        {isLoginMode ? (
          /* ════════════ LOGIN FORM — ek hi password ════════════ */
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                EMAIL / IDENTIFIER
              </label>
              <input
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-[#161d2b] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-[#161d2b] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                placeholder="••••••••"
              />
              <div className="text-right mt-1.5">
                <a
                  href="/forgot-password"
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Forgot Password?
                </a>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-black font-extrabold py-2.5 rounded text-sm transition tracking-wider mt-2 cursor-pointer shadow-lg shadow-cyan-500/20"
            >
              {loading ? "LOGGING IN..." : "LOGIN TO ARENA"}
            </button>
          </form>
        ) : (
          /* ════════════ SIGNUP FORM ════════════ */
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                EMAIL / IDENTIFIER
              </label>
              <input
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-[#161d2b] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                SET PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={6}
                className="w-full bg-[#161d2b] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                placeholder="Min 6 characters"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                CONFIRM PASSWORD
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-[#161d2b] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-60 text-black font-bold py-2.5 rounded text-sm transition tracking-wider mt-2 cursor-pointer"
            >
              {loading ? "CREATING..." : "CREATE ACCOUNT"}
            </button>
          </form>
        )}

        <div className="text-center mt-6 pt-4 border-t border-gray-800">
          {isLoginMode ? (
            <p className="text-xs text-gray-400">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode(false)}
                className="text-cyan-400 hover:underline font-semibold cursor-pointer ml-1"
              >
                Create Account
              </button>
            </p>
          ) : (
            <p className="text-xs text-gray-400">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode(true)}
                className="text-cyan-400 hover:underline font-semibold cursor-pointer ml-1"
              >
                Login here
              </button>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}