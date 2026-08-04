"use client";

import { useState, useEffect } from "react";

export default function AdminWithdrawalsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const loadRequests = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/withdrawals", {
        headers: { "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY },
      });
      const data = await res.json();
      setRequests(data.requests || []);
      if (!res.ok) setErrorMsg(data.error || "Failed to load requests");
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleAction = async (request, action) => {
    if (action === "APPROVE") {
      const confirmed = window.confirm(
        `Confirm karo: ₹${request.amount} UPI ID "${request.upiId}" pe manually bhej diya hai?`
      );
      if (!confirmed) return;
    }

    setProcessingId(request.id);
    try {
      const res = await fetch("/api/admin/withdrawals/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY,
        },
        body: JSON.stringify({ requestId: request.id, action }),
      });
      const data = await res.json();

      if (data.success) {
        setRequests((prev) => prev.filter((r) => r.id !== request.id));
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
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 20, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24 }}>Admin — Withdrawal Requests</h1>
        <button
          onClick={loadRequests}
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

      {loading && <p>Loading withdrawal requests...</p>}
      {!loading && requests.length === 0 && !errorMsg && <p>No pending withdrawals 🎉</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {requests.map((r) => (
          <div key={r.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16 }}>
            <p><strong>Amount:</strong> ₹{r.amount}</p>
            <p><strong>UPI ID:</strong> {r.upiId}</p>
            <p><strong>User Email:</strong> {r.user?.email || "-"}</p>
            <p><strong>Requested At:</strong> {new Date(r.createdAt).toLocaleString()}</p>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                onClick={() => handleAction(r, "APPROVE")}
                disabled={processingId === r.id}
                style={{
                  padding: "8px 20px",
                  background: "green",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                {processingId === r.id ? "Processing..." : "Mark as Paid / Approve"}
              </button>
              <button
                onClick={() => handleAction(r, "REJECT")}
                disabled={processingId === r.id}
                style={{
                  padding: "8px 20px",
                  background: "crimson",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                {processingId === r.id ? "Processing..." : "Reject & Refund"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}