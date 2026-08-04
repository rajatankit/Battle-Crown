"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../lib/firebase";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendEmailVerification, 
  signOut 
} from "firebase/auth";

export default function AuthPage() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const router = useRouter();

  // Handle Login & Email Verification Check
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, identifier, password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        setErrorMessage("❌ Your email is not verified! Please check your inbox and verify your email before logging into the dashboard.");
        await signOut(auth);
        return;
      }

      setSuccessMessage("✅ Login Successful! Entering arena...");
      setTimeout(() => {
        router.push("/dashboard");
      }, 1000);

    } catch (error) {
      console.error("Login error: ", error);
      setErrorMessage("❌ Invalid email or password: " + error.message);
    }
  };

  // Handle Account Creation & Database Sync
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!password || !confirmPassword) {
      setErrorMessage("❌ Please fill in both password fields.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("❌ Passwords do not match!");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("❌ Password must be at least 6 characters long.");
      return;
    }

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, identifier, password);
      const user = userCredential.user;

      // 2. Save user to Neon Database via API Route
      const dbResponse = await fetch("/api/user/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          name: "Player",
        }),
      });

      const dbData = await dbResponse.json();

      if (!dbData.success) {
        throw new Error(dbData.error || "Failed to save user in database");
      }

      // 3. Send Verification Email
      await sendEmailVerification(user);
      await signOut(auth);

      setSuccessMessage("✅ Account Created! Verification email sent. Please check your inbox and verify before logging in.");
      
      setTimeout(() => {
        setIsLoginMode(true);
        setSuccessMessage(null);
        setPassword("");
        setConfirmPassword("");
      }, 4000);

    } catch (error) {
      console.error("Error creating user: ", error);
      setErrorMessage("❌ Failed to create account: " + error.message);
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
            {isLoginMode ? "// AGENT LOGIN PORTAL" : "// CREATE NEW AGENT ACCOUNT"}
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
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">EMAIL / IDENTIFIER</label>
              <input 
                type="email" 
                value={identifier} 
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="w-full bg-[#161d2b] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">PASSWORD</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-[#161d2b] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit"
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold py-2.5 rounded text-sm transition tracking-wider mt-2 cursor-pointer shadow-lg shadow-cyan-500/20"
            >
              LOGIN TO ARENA
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">EMAIL / IDENTIFIER</label>
              <input 
                type="email" 
                value={identifier} 
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="w-full bg-[#161d2b] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">SET PASSWORD</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-[#161d2b] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">CONFIRM PASSWORD</label>
              <input 
                type="password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-[#161d2b] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit"
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2.5 rounded text-sm transition tracking-wider mt-2 cursor-pointer"
            >
              CREATE ACCOUNT
            </button>
          </form>
        )}

        <div className="text-center mt-6 pt-4 border-t border-gray-800">
          {isLoginMode ? (
            <p className="text-xs text-gray-400">
              Don't have an account?{" "}
              <button 
                onClick={() => { setIsLoginMode(false); setErrorMessage(null); setSuccessMessage(null); }}
                className="text-cyan-400 hover:underline font-semibold cursor-pointer ml-1"
              >
                Create Account
              </button>
            </p>
          ) : (
            <p className="text-xs text-gray-400">
              Already have an account?{" "}
              <button 
                onClick={() => { setIsLoginMode(true); setErrorMessage(null); setSuccessMessage(null); }}
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