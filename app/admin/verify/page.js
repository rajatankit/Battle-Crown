"use client";

import { useState, useEffect } from "react";
import { auth } from "@/app/lib/firebase"; // path adjust karo
import { onAuthStateChanged } from "firebase/auth";

export default function AdminVerifyPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [user, setUser] = useState(null);

  // Wait for Firebase auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setLoading(false);
    });
    return () => unsub();
  }, []);

  const getToken = async () => {
    const current = auth.currentUser;
    if (!current) return null;
    return current.getIdToken();
  };

  const loadMatches = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const token = await getToken();
      if (!token) {
        setErrorMsg("Please login with an admin account first.");
        setMatches([]);
        return;
      }

      const res = await fetch("/api/admin/pending-matches", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const data = await res.json();
      const list = data.matches || data.data || (Array.isArray(data) ? data : []);
      setMatches(list);

      if (!res.ok) {
        setErrorMsg(data.error || data.message || "Failed to load pending matches");
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadMatches();
  }, [user]);

  const updateField = (matchId, field, value) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, [field]: value } : m))
    );
  };

  const handleAction = async (match, action) => {
    setProcessingId(match.id);
    try {
      const token = await getToken();
      if (!token) {
        alert("Please login again.");
        return;
      }

      const res = await fetch(`/api/admin/matches/${match.id}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          kills: Number(match.kills) || 0,
          placement: Number(match.rank) || 0,
          action,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMatches((prev) => prev.filter((m) => m.id !== match.id));
        alert(data.message);
      } else {
        alert(data.error || "Something went wrong");
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  if (!user && !loading) {
    return (
      <div style={{ maxWidth: 500, margin: "80px auto", padding: 20, textAlign: "center" }}>
        <h1>Admin — Verify Matches</h1>
        <p style={{ color: "#666", marginTop: 12 }}>
          Please{" "}
          <a href="/login" style={{ color: "#06b6d4" }}>
            login
          </a>{" "}
          with an admin account.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 20, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24 }}>Admin — Verify Matches</h1>
        <button
          onClick={loadMatches}
          style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer" }}
        >
          Refresh
        </button>
      </div>

      {errorMsg && (
        <div style={{ background: "#ffe6e6", color: "#c00", padding: 10, borderRadius: 6, marginBottom: 16 }}>
          {errorMsg}
        </div>
      )}

      {loading && <p>Loading pending matches...</p>}

      {!loading && matches.length === 0 && !errorMsg && (
        <p>No pending matches to verify 🎉</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {matches.map((match) => (
          <div
            key={match.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 16,
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flexShrink: 0 }}>
              {match.screenshotUrl ? (
                <a href={match.screenshotUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={match.screenshotUrl}
                    alt="Match proof"
                    style={{
                      width: 160,
                      height: 220,
                      objectFit: "cover",
                      borderRadius: 8,
                      border: "1px solid #ccc",
                    }}
                  />
                </a>
              ) : (
                <div
                  style={{
                    width: 160,
                    height: 220,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#f2f2f2",
                    borderRadius: 8,
                    color: "#999",
                    fontSize: 12,
                  }}
                >
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
                  Kills
                  <input
                    type="number"
                    min={0}
                    value={match.kills ?? ""}
                    onChange={(e) => updateField(match.id, "kills", e.target.value)}
                    style={{ width: 80, padding: 6, marginLeft: 6 }}
                  />
                </label>

                <label>
                  Rank / Placement
                  <input
                    type="number"
                    min={0}
                    value={match.rank ?? ""}
                    onChange={(e) => updateField(match.id, "rank", e.target.value)}
                    style={{ width: 80, padding: 6, marginLeft: 6 }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  onClick={() => handleAction(match, "APPROVE")}
                  disabled={processingId === match.id}
                  style={{
                    padding: "8px 20px",
                    background: "green",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    opacity: processingId === match.id ? 0.6 : 1,
                  }}
                >
                  {processingId === match.id ? "Processing..." : "Approve"}
                </button>

                <button
                  onClick={() => handleAction(match, "REJECT")}
                  disabled={processingId === match.id}
                  style={{
                    padding: "8px 20px",
                    background: "crimson",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    opacity: processingId === match.id ? 0.6 : 1,
                  }}
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