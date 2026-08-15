"use client";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase"; // tumhara path check karlo

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
      setMessage("Reset link aapke email pe bhej diya gaya hai. Inbox check karein.");
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        setMessage("Is email se koi account registered nahi hai.");
      } else if (error.code === "auth/invalid-email") {
        setMessage("Email sahi format mein nahi hai.");
      } else {
        setMessage("Kuch galat ho gaya, dobara try karein.");
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
          placeholder="Apna registered email daalein"
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
          {loading ? "Bhej rahe hain..." : "Reset Link Bhejein"}
        </button>
      </form>
      {message && <p className="mt-3 text-sm">{message}</p>}
    </div>
  );
}