// app/components/MatchHistoryModal.jsx
"use client";
import { useEffect, useState } from "react";

export default function MatchHistoryModal({ email, onClose }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/match-history?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.success) setMatches(data.matches);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (email) fetchHistory();
  }, [email]);

  const handleUpload = async (matchId, file) => {
    if (!file || !matchId) return;
    setUploadingId(matchId);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("email", email);
    formData.append("matchId", matchId);

    try {
      const res = await fetch("/api/match/upload-screenshot", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        fetchHistory();
      } else {
        alert(data.message || "Upload failed");
      }
    } catch (err) {
      alert("Upload error: " + err.message);
    }
    setUploadingId(null);
  };

  const statusColor = (status) => {
    if (["VERIFIED", "PAID"].includes(status)) return "text-green-400";
    if (["REJECTED", "FAILED"].includes(status)) return "text-red-400";
    if (["PENDING_PAYOUT", "ADMIN_REVIEW"].includes(status)) return "text-yellow-400";
    return "text-gray-400";
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center">
      <div className="bg-[#0b0f17] w-full sm:w-[480px] max-h-[85vh] rounded-t-2xl sm:rounded-2xl border border-gray-800 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-black uppercase tracking-wide text-white">📋 Match History</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <p className="text-xs text-gray-500 text-center py-8">Loading...</p>
          ) : matches.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8">No tournaments joined yet.</p>
          ) : (
            matches.map((m) => (
              <div key={m.id} className="bg-[#111824] border border-gray-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">{m.tournamentName}</span>
                  <span className="text-[10px] font-mono text-gray-400">{m.gameType}</span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono mt-2">
                  <div className="text-gray-500">Entry Fee</div>
                  <div className="text-green-400 text-right">₹{m.entryFeePaid}</div>

                  <div className="text-gray-500">Payment</div>
                  <div className={`text-right ${statusColor(m.paymentStatus)}`}>{m.paymentStatus}</div>

                  <div className="text-gray-500">Result</div>
                  <div className={`text-right ${statusColor(m.resultStatus)}`}>{m.resultStatus}</div>

                  <div className="text-gray-500">Reward</div>
                  <div className={`text-right ${statusColor(m.rewardStatus)}`}>
                    {m.rewardStatus === "NO_REWARD" ? "—" : `₹${m.rewardAmount} (${m.rewardStatus})`}
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-gray-800">
                  {m.screenshotUrl ? (
                    <img src={m.screenshotUrl} alt="proof" className="w-20 h-20 object-cover rounded border border-gray-700" />
                  ) : (
                    <label className="inline-flex items-center gap-2 text-[10px] font-bold text-cyan-400 border border-cyan-800 bg-cyan-950/30 px-3 py-1.5 rounded cursor-pointer hover:bg-cyan-950/60">
                      {uploadingId === m.dbMatchId ? "Uploading..." : "📤 Upload Screenshot"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingId === m.dbMatchId}
                        onChange={(e) => handleUpload(m.dbMatchId, e.target.files[0])}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}