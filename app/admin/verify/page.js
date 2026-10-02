"use client";

import { useState, useEffect } from "react";
import { auth } from "@/app/lib/firebase"; // apna path check karo
import { onAuthStateChanged } from "firebase/auth";

export default function AdminVerifyPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [authReady, setAuthReady] = useState(false);

  // Wait for Firebase auth to resolve before calling admin APIs
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => setAuthReady(true));
    return () => unsub();
  }, []);

  const authHeaders = async () => {
    const user = auth.currentUser;
    if (!user) return null;
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  };

  const loadMatches = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      const headers = await authHeaders();
      if (!headers) {
        setErrorMsg("Please login as admin first.");
        setMatches([]);
        return;
      }

      const res = await fetch("/api/admin/pending-matches", {
        method: "GET",
        headers,
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Failed to load pending matches");
        setMatches([]);
        return;
      }

      const list = data.matches || data.data || (Array.isArray(data) ? data : []);
      setMatches(list);
    } catch (err) {
      console.error("Load matches error:", err);
      setErrorMsg(err?.message || "Failed to load pending matches");
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authReady) loadMatches();
  }, [authReady]);

  const updateField = (matchId, field, value) => {
    setMatches((prev) =>
      prev.map((match) => (match.id === matchId ? { ...match, [field]: value } : match))
    );
  };

  const handleAction = async (match, action) => {
    if (processingId === match.id) return;
    setProcessingId(match.id);

    try {
      const headers = await authHeaders();
      if (!headers) {
        alert("Please login as admin first.");
        return;
      }

      const res = await fetch(`/api/admin/matches/${match.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          kills: Number(match.kills) || 0,
          placement: Number(match.rank) || 0,
          action,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Something went wrong");
        return;
      }

      if (data.success) {
        setMatches((prev) => prev.filter((item) => item.id !== match.id));
        alert(data.message || `Match ${action.toLowerCase()}d successfully`);
      } else {
        alert(data.error || "Something went wrong");
      }
    } catch (err) {
      console.error("Verify match error:", err);
      alert(err?.message || "Failed to process match");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 20, fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 15 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Admin — Verify Matches</h1>
        <button
          onClick={loadMatches}
          disabled={loading}
          style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc", cursor: loading ? "not-allowed" : "pointer", background: "#fff" }}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {errorMsg && (
        <div style={{ background: "#ffe6e6", color: "#c00", padding: 12, borderRadius: 6, marginBottom: 16, border: "1px solid #ffb3b3" }}>
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {loading && <p>Loading pending matches...</p>}

      {!loading && matches.length === 0 && !errorMsg && <p>No pending matches to verify 🎉</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {matches.map((match) => (
          <div key={match.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, display: "flex", gap: 16, flexWrap: "wrap", background: "#fff" }}>
            <div style={{ flexShrink: 0 }}>
              {match.screenshotUrl ? (
                <a href={match.screenshotUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={match.screenshotUrl}
                    alt="Match proof screenshot"
                    style={{ width: 160, height: 220, objectFit: "cover", borderRadius: 8, border: "1px solid #ccc", display: "block" }}
                  />
                </a>
              ) : (
                <div style={{ width: 160, height: 220, display: "flex", alignItems: "center", justifyContent: "center", background: "#f2f2f2", borderRadius: 8, color: "#999", fontSize: 12, textAlign: "center" }}>
                  No screenshot
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 240 }}>
              <p><strong>Match ID:</strong> {match.id}</p>
              <p><strong>Player IGN:</strong> {match.ign || "-"}</p>
              <p><strong>UID:</strong> {match.uid || "-"}</p>
              <p><strong>Email:</strong> {match.email || "-"}</p>
              <p><strong>Tournament:</strong> {match.tournamentName || "-"}</p>
              <p><strong>Status:</strong> {match.resultStatus || "-"}</p>

              <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                <label>
                  <strong>Kills</strong><br />
                  <input
                    type="number"
                    min="0"
                    value={match.kills ?? ""}
                    onChange={(e) => updateField(match.id, "kills", Number(e.target.value))}
                    style={{ width: 80, padding: 6, marginTop: 4 }}
                  />
                </label>

                <label>
                  <strong>Rank</strong><br />
                  <input
                    type="number"
                    min="1"
                    value={match.rank ?? ""}
                    onChange={(e) => updateField(match.id, "rank", Number(e.target.value))}
                    style={{ width: 70, padding: 6, marginTop: 4 }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  onClick={() => handleAction(match, "APPROVE")}
                  disabled={processingId === match.id}
                  style={{ padding: "8px 20px", background: "green", color: "white", border: "none", borderRadius: 6, cursor: processingId === match.id ? "not-allowed" : "pointer", opacity: processingId === match.id ? 0.6 : 1 }}
                >
                  {processingId === match.id ? "Processing..." : "Approve"}
                </button>

                <button
                  onClick={() => handleAction(match, "REJECT")}
                  disabled={processingId === match.id}
                  style={{ padding: "8px 20px", background: "crimson", color: "white", border: "none", borderRadius: 6, cursor: processingId === match.id ? "not-allowed" : "pointer", opacity: processingId === match.id ? 0.6 : 1 }}
                >
                  {processingId === match.id ? "Processing..." : "Reject"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}