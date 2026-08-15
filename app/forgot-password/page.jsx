"use client";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase"; // Check your path

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage(
        "A password reset link has been sent to your registered email address. Please check your inbox. If you don't see it, check your spam or junk folder as well."
      );
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        setMessage("No account is registered with this email address.");
      } else if (error.code === "auth/invalid-email") {
        setMessage("Please enter a valid email address.");
      } else {
        setMessage("We couldn't process your request. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-6">
      <h1 className="text-xl font-bold mb-4">Forgot Password</h1>
      <form onSubmit={handleReset} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Enter your registered email address to reset your password."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border p-2 rounded"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white p-2 rounded"
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>
      {message && <p className="mt-3 text-sm">{message}</p>}

      <div className="text-center mt-4">
  <a 
    href="/" 
    className="text-sm text-cyan-400 hover:underline"
  >
    ← Back to Login
  </a>
</div>
    </div>
  );
}