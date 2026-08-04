"use client";

import { useState, useEffect } from "react";

export default function AdminVerifyPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Fetch all pending matches on page load
  const loadMatches = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/pending-matches", {
        headers: {
          "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY,
        },
      });
      const data = await res.json();

      // Handle common response shapes: {matches: [...]}, {data: [...]}, or [...]
      const list = data.matches || data.data || (Array.isArray(data) ? data : []);
      setMatches(list);

      if (!res.ok) {
        setErrorMsg(data.error || "Failed to load pending matches");
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatches();
  }, []);

  // Update a field (kills, totalRoomEntryFee, rank) for a specific match in local state
  const updateField = (matchId, field, value) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, [field]: value } : m))
    );
  };

  const handleAction = async (match, action) => {
    setProcessingId(match.id);
    try {
      const res = await fetch("/api/admin/verify-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY,
        },
        body: JSON.stringify({
          matchId: match.id,
          kills: match.kills || 0,
          totalRoomEntryFee: match.totalRoomEntryFee || match.entryFee || 0,
          rank: match.rank || 0,
          action,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Remove this match from the pending list after action
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
            {/* Screenshot preview */}
            <div style={{ flexShrink: 0 }}>
              {match.screenshotUrl ? (
                <a href={match.screenshotUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={match.screenshotUrl}
                    alt="Match proof screenshot"
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
                    textAlign: "center",
                  }}
                >
                  No screenshot
                </div>
              )}
            </div>

            {/* Match details + editable fields */}
            <div style={{ flex: 1, minWidth: 240 }}>
              <p><strong>Match ID:</strong> {match.id}</p>
              <p><strong>Player IGN:</strong> {match.ign || "-"}</p>
              <p><strong>UID:</strong> {match.uid || "-"}</p>
              <p><strong>Email:</strong> {match.email || "-"}</p>
              <p><strong>Tournament:</strong> {match.tournamentName || "-"}</p>

              <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                <label>
                  Kills
                  <input
                    type="number"
                    value={match.kills ?? ""}
                    onChange={(e) => updateField(match.id, "kills", e.target.value)}
                    style={{ width: 80, padding: 6, marginLeft: 6 }}
                  />
                </label>

                <label>
                  Room Fee (₹)
                  <input
                    type="number"
                    value={match.totalRoomEntryFee ?? match.entryFee ?? ""}
                    onChange={(e) => updateField(match.id, "totalRoomEntryFee", e.target.value)}
                    style={{ width: 100, padding: 6, marginLeft: 6 }}
                  />
                </label>

                <label>
                  Rank
                  <input
                    type="number"
                    value={match.rank ?? ""}
                    onChange={(e) => updateField(match.id, "rank", e.target.value)}
                    style={{ width: 70, padding: 6, marginLeft: 6 }}
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