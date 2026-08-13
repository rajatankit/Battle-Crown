"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("overview");

  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);

  const [roomId, setRoomId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");

  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);
  
  
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
    const [withdrawalLoading, setWithdrawalLoading] = useState(false);
    const [withdrawalProcessingId, setWithdrawalProcessingId] = useState(null);
    const [withdrawalError, setWithdrawalError] = useState("");

    const [matches, setMatches] = useState([]);
const [matchLoading, setMatchLoading] = useState(false);
const [matchProcessingId, setMatchProcessingId] = useState(null);
const [matchError, setMatchError] = useState("");


// ==========================================
// LOAD PENDING MATCHES
// ==========================================

const loadMatches = async () => {
  setMatchLoading(true);
  setMatchError("");

  try {
    const res = await fetch("/api/admin/pending-matches", {
      headers: {
        "x-admin-key":
          process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY,
      },
    });

    const data = await res.json();

    const list =
      data.matches ||
      data.data ||
      (Array.isArray(data) ? data : []);

    setMatches(list);

    if (!res.ok) {
      setMatchError(
        data.error || "Failed to load pending matches"
      );
    }
  } catch (err) {
    setMatchError(err.message);
  } finally {
    setMatchLoading(false);
  }
};

// ==========================================
// UPDATE MATCH FIELD
// ==========================================

const updateMatchField = (matchId, field, value) => {
  setMatches((prev) =>
    prev.map((match) =>
      match.id === matchId
        ? { ...match, [field]: value }
        : match
    )
  );
};

// ==========================================
// VERIFY / REJECT MATCH
// ==========================================

const handleMatchAction = async (match, action) => {
  setMatchProcessingId(match.id);

  try {
    const res = await fetch(
      "/api/admin/verify-match",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key":
            process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY,
        },
        body: JSON.stringify({
          matchId: match.id,
          kills: match.kills || 0,
          totalRoomEntryFee:
            match.totalRoomEntryFee ||
            match.entryFee ||
            0,
          rank: match.rank || 0,
          action,
        }),
      }
    );

    const data = await res.json();

    if (data.success) {
      setMatches((prev) =>
        prev.filter(
          (m) => m.id !== match.id
        )
      );

      alert(data.message);
    } else {
      alert(
        data.error ||
          "Something went wrong"
      );
    }
  } catch (err) {
    console.error(
      "Match verification error:",
      err
    );

    alert(
      err.message ||
        "Something went wrong"
    );
  } finally {
    setMatchProcessingId(null);
  }
};


    // ==========================================
// LOAD WITHDRAWAL REQUESTS
// ==========================================

const loadWithdrawals = async () => {
  setWithdrawalLoading(true);
  setWithdrawalError("");

  try {
    const res = await fetch("/api/admin/withdraw", {
      headers: {
        "x-admin-key":
          process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY,
      },
    });

    const data = await res.json();

    setWithdrawalRequests(data.requests || []);

    if (!res.ok) {
      setWithdrawalError(
        data.error || "Failed to load withdrawal requests"
      );
    }
  } catch (err) {
    setWithdrawalError(err.message);
  } finally {
    setWithdrawalLoading(false);
  }
};

// ==========================================
// WITHDRAWAL ACTION
// ==========================================

const handleWithdrawalAction = async (request, action) => {
  if (action === "APPROVE") {
    const confirmed = window.confirm(
      `Confirm karo: ₹${request.amount} UPI ID "${request.upiId}" pe manually bhej diya hai?`
    );

    if (!confirmed) return;
  }

  setWithdrawalProcessingId(request.id);

  try {
    const res = await fetch(
      "/api/wallet/withdrawals/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key":
            process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY,
        },
        body: JSON.stringify({
          requestId: request.id,
          action,
        }),
      }
    );

    const text = await res.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      console.error("Server response:", text);

      throw new Error(
        `Server ne JSON ke bajay error page bheji. Status: ${res.status}`
      );
    }

    if (data.success) {
      setWithdrawalRequests((prev) =>
        prev.filter((r) => r.id !== request.id)
      );

      alert(data.message);
    } else {
      alert(
        data.error || "Something went wrong"
      );
    }
  } catch (err) {
    console.error(
      "Withdrawal action error:",
      err
    );

    alert(
      err.message || "Something went wrong"
    );
  } finally {
    setWithdrawalProcessingId(null);
  }
};

  // ==========================================
  // LOAD TOURNAMENTS
  // ==========================================

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "tournaments"),
      (snapshot) => {
        const list = snapshot.docs.map((firebaseDoc) => ({
          id: firebaseDoc.id,
          ...firebaseDoc.data(),
        }));

        setTournaments(list);
      },
      (error) => {
        console.error("Tournament listener error:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // ==========================================
  // MANAGE TOURNAMENT
  // ==========================================

  const handleManageTournament = (tournament) => {
    setSelectedTournament(tournament);

    setRoomId(tournament.roomId || "");
    setRoomPassword(tournament.roomPassword || "");
  };

  // ==========================================
  // SAVE ROOM DETAILS
  // ==========================================

  const saveRoomDetails = async () => {
    if (!selectedTournament) return;

    if (!roomId.trim() || !roomPassword.trim()) {
      alert("❌ Room ID and Room Password are required");
      return;
    }

    try {
      await updateDoc(
        doc(db, "tournaments", selectedTournament.id),
        {
          roomId: roomId.trim(),
          roomPassword: roomPassword.trim(),
        }
      );

      const response = await fetch("/api/admin/send-room-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tournamentId: selectedTournament.id,
          roomId: roomId.trim(),
          roomPassword: roomPassword.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            result.error ||
            "Failed to send room details"
        );
      }

      alert("✅ Room Details Saved & Notifications Sent");

      setSelectedTournament(null);
    } catch (error) {
      console.error("Room details error:", error);
      alert("❌ " + error.message);
    }
  };

  // ==========================================
  // GLOBAL NOTIFICATION
  // ==========================================

  const sendGlobalNotification = async () => {
    const title = notificationTitle.trim();
    const message = notificationMessage.trim();

    if (!title) {
      alert("❌ Please enter notification title");
      return;
    }

    if (!message) {
      alert("❌ Please enter notification message");
      return;
    }

    if (sendingNotification) return;

    try {
      setSendingNotification(true);

      const adminSecret =
        process.env.NEXT_PUBLIC_ADMIN_BROADCAST_SECRET;

      if (!adminSecret) {
        throw new Error(
          "NEXT_PUBLIC_ADMIN_BROADCAST_SECRET is missing"
        );
      }

      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({
          title,
          message,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            result.message ||
            "Failed to send notification"
        );
      }

      alert(
        `✅ Global Notification Sent!\n\n` +
          `Users: ${result.totalUsers ?? 0}\n` +
          `Success: ${result.successCount ?? 0}\n` +
          `Failed: ${result.failureCount ?? 0}`
      );

      setNotificationTitle("");
      setNotificationMessage("");
    } catch (error) {
      console.error("Global notification error:", error);
      alert("❌ " + error.message);
    } finally {
      setSendingNotification(false);
    }
  };

  // ==========================================
  // TABS
  // ==========================================

  const tabs = [
    { id: "overview", label: "📊 Overview" },
    { id: "tournaments", label: "🏆 Tournaments" },
    { id: "matches", label: "🎮 Verify Matches" },
    { id: "withdrawals", label: "💰 Withdrawals" },
    { id: "notifications", label: "🔔 Notifications" },
  ];

  return (
    <main className="min-h-screen bg-[#0b0f17] text-white">

      {/* ======================================
          HEADER
      ====================================== */}

      <header className="border-b border-gray-800 bg-[#0f141d] px-4 py-5 md:px-8">

        <div className="max-w-7xl mx-auto">

          <h1 className="text-2xl md:text-3xl font-bold text-cyan-400">
            👑 Battle Crown Admin
          </h1>

          <p className="text-gray-400 text-sm mt-1">
            Manage your Battle Crown platform
          </p>

        </div>

      </header>

      {/* ======================================
          TABS
      ====================================== */}

      <div className="border-b border-gray-800 bg-[#0f141d] overflow-x-auto">

        <div className="max-w-7xl mx-auto px-4 md:px-8">

          <div className="flex gap-2 min-w-max py-3">

            {tabs.map((tab) => (

              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? "bg-cyan-400 text-black"
                    : "bg-[#151b24] text-gray-300 hover:bg-[#1c2531] hover:text-white"
                }`}
              >
                {tab.label}
              </button>

            ))}

          </div>

        </div>

      </div>

      {/* ======================================
          MAIN CONTENT
      ====================================== */}

      <div className="max-w-7xl mx-auto px-4 py-6 md:px-8">

        {/* ==================================
            OVERVIEW
        ================================== */}

        {activeTab === "overview" && (

          <section>

            <h2 className="text-2xl font-bold mb-6">
              Dashboard Overview
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

              <div className="bg-[#151b24] border border-gray-700 rounded-xl p-5">

                <p className="text-gray-400 text-sm">
                  Active Tournaments
                </p>

                <p className="text-3xl font-bold text-green-400 mt-2">
                  {tournaments.length}
                </p>

              </div>

              <div className="bg-[#151b24] border border-gray-700 rounded-xl p-5">

                <p className="text-gray-400 text-sm">
                  Pending Matches
                </p>

                <p className="text-3xl font-bold text-cyan-400 mt-2">
                  —
                </p>

              </div>

              <div className="bg-[#151b24] border border-gray-700 rounded-xl p-5">

                <p className="text-gray-400 text-sm">
                  Pending Withdrawals
                </p>

                <p className="text-3xl font-bold text-yellow-400 mt-2">
                  —
                </p>

              </div>

            </div>

            <div className="mt-8 bg-[#151b24] border border-gray-700 rounded-xl p-6">

              <h3 className="text-xl font-bold">
                Welcome to Battle Crown Admin 👑
              </h3>

              <p className="text-gray-400 mt-2">
                Use the tabs above to manage tournaments,
                verify matches, process withdrawals and
                send notifications.
              </p>

            </div>

          </section>

        )}

        {/* ==================================
            TOURNAMENTS
        ================================== */}

        {activeTab === "tournaments" && (

          <section>

            <div className="flex items-center justify-between mb-6">

              <div>

                <h2 className="text-2xl font-bold text-cyan-400">
                  🏆 Active Tournaments
                </h2>

                <p className="text-gray-400 mt-1">
                  Manage room details and tournament access.
                </p>

              </div>

              <span className="bg-[#151b24] border border-gray-700 px-4 py-2 rounded-lg text-sm">
                {tournaments.length} Tournaments
              </span>

            </div>

            <div className="space-y-4">

              {tournaments.length === 0 ? (

                <div className="bg-[#151b24] border border-gray-700 rounded-xl p-6 text-gray-400">
                  No tournaments found.
                </div>

              ) : (

                tournaments.map((tournament) => (

                  <div
                    key={tournament.id}
                    className="bg-[#151b24] border border-gray-700 rounded-xl p-5 flex flex-col md:flex-row justify-between gap-4 md:items-center"
                  >

                    <div>

                      <h3 className="text-xl font-bold">
                        {tournament.title ||
                          "Untitled Tournament"}
                      </h3>

                      <p className="text-gray-400 mt-1">
                        {tournament.game ||
                          "Game not specified"}
                      </p>

                      <p className="text-green-400 mt-1">
                        Joined:{" "}
                        {tournament.joinedCount ?? 0}/
                        {tournament.maxSlots ?? 100}
                      </p>

                    </div>

                    <button
                      onClick={() =>
                        handleManageTournament(tournament)
                      }
                      className="bg-cyan-500 hover:bg-cyan-400 text-black px-5 py-2 rounded-lg font-bold transition"
                    >
                      Manage
                    </button>

                  </div>

                ))

              )}

            </div>

          </section>

        )}

        {/* ==================================
            VERIFY MATCHES
        ================================== */}

       {activeTab === "matches" && (
  <section>

    {/* HEADER */}

    <div className="flex items-center justify-between mb-6">

      <div>
        <h2 className="text-2xl font-bold text-cyan-400">
          🎮 Verify Matches
        </h2>

        <p className="text-gray-400 mt-1">
          Review screenshots and verify player results.
        </p>
      </div>

      <button
        onClick={loadMatches}
        className="bg-[#151b24] border border-gray-700 hover:border-cyan-500 px-4 py-2 rounded-lg text-sm font-semibold"
      >
        🔄 Refresh
      </button>

    </div>

    {/* ERROR */}

    {matchError && (
      <div className="bg-red-500/10 border border-red-500/40 text-red-400 p-4 rounded-lg mb-5">
        {matchError}
      </div>
    )}

    {/* LOADING */}

    {matchLoading && (
      <div className="bg-[#151b24] border border-gray-700 rounded-xl p-6 text-gray-400">
        Loading pending matches...
      </div>
    )}

    {/* EMPTY */}

    {!matchLoading &&
      matches.length === 0 &&
      !matchError && (
        <div className="bg-[#151b24] border border-gray-700 rounded-xl p-6 text-gray-400">
          No pending matches to verify 🎉
        </div>
      )}

    {/* MATCHES */}

    <div className="space-y-5">

      {matches.map((match) => (

        <div
          key={match.id}
          className="bg-[#151b24] border border-gray-700 rounded-xl p-5"
        >

          <div className="flex flex-col lg:flex-row gap-6">

            {/* SCREENSHOT */}

            <div className="flex-shrink-0">

              {match.screenshotUrl ? (

                <a
                  href={match.screenshotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >

                  <img
                    src={match.screenshotUrl}
                    alt="Match proof screenshot"
                    className="w-[160px] h-[220px] object-cover rounded-lg border border-gray-700"
                  />

                </a>

              ) : (

                <div className="w-[160px] h-[220px] flex items-center justify-center bg-[#0b0f17] rounded-lg border border-gray-700 text-gray-500 text-xs text-center">
                  No screenshot
                </div>

              )}

            </div>

            {/* DETAILS */}

            <div className="flex-1">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">

                <p>
                  <span className="text-gray-400">
                    Match ID:
                  </span>{" "}
                  {match.id}
                </p>

                <p>
                  <span className="text-gray-400">
                    Player IGN:
                  </span>{" "}
                  {match.ign || "-"}
                </p>

                <p>
                  <span className="text-gray-400">
                    UID:
                  </span>{" "}
                  {match.uid || "-"}
                </p>

                <p>
                  <span className="text-gray-400">
                    Email:
                  </span>{" "}
                  {match.email || "-"}
                </p>

                <p className="md:col-span-2">
                  <span className="text-gray-400">
                    Tournament:
                  </span>{" "}
                  {match.tournamentName || "-"}
                </p>

              </div>

              {/* EDITABLE FIELDS */}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Kills
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={match.kills ?? ""}
                    onChange={(e) =>
                      updateMatchField(
                        match.id,
                        "kills",
                        e.target.value
                      )
                    }
                    className="w-full p-2.5 rounded-lg bg-[#0b0f17] border border-gray-700 focus:border-cyan-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Room Fee (₹)
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={
                      match.totalRoomEntryFee ??
                      match.entryFee ??
                      ""
                    }
                    onChange={(e) =>
                      updateMatchField(
                        match.id,
                        "totalRoomEntryFee",
                        e.target.value
                      )
                    }
                    className="w-full p-2.5 rounded-lg bg-[#0b0f17] border border-gray-700 focus:border-cyan-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Rank
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={match.rank ?? ""}
                    onChange={(e) =>
                      updateMatchField(
                        match.id,
                        "rank",
                        e.target.value
                      )
                    }
                    className="w-full p-2.5 rounded-lg bg-[#0b0f17] border border-gray-700 focus:border-cyan-500 outline-none"
                  />
                </div>

              </div>

              {/* ACTIONS */}

              <div className="flex flex-wrap gap-3 mt-5">

                <button
                  onClick={() =>
                    handleMatchAction(
                      match,
                      "APPROVE"
                    )
                  }
                  disabled={
                    matchProcessingId ===
                    match.id
                  }
                  className="bg-green-500 hover:bg-green-400 disabled:bg-gray-600 text-black px-5 py-2.5 rounded-lg font-bold"
                >
                  {matchProcessingId ===
                  match.id
                    ? "Processing..."
                    : "✓ Approve"}
                </button>

                <button
                  onClick={() =>
                    handleMatchAction(
                      match,
                      "REJECT"
                    )
                  }
                  disabled={
                    matchProcessingId ===
                    match.id
                  }
                  className="bg-red-500 hover:bg-red-400 disabled:bg-gray-600 text-white px-5 py-2.5 rounded-lg font-bold"
                >
                  {matchProcessingId ===
                  match.id
                    ? "Processing..."
                    : "✕ Reject"}
                </button>

              </div>

            </div>

          </div>

        </div>

      ))}

    </div>

  </section>
)}

        {activeTab === "withdrawals" && (
  <section>

    <div className="flex items-center justify-between mb-6">

      <div>
        <h2 className="text-2xl font-bold text-cyan-400">
          💰 Withdrawal Requests
        </h2>

        <p className="text-gray-400 mt-1">
          Review and process pending withdrawal requests.
        </p>
      </div>

      <button
        onClick={loadWithdrawals}
        className="bg-[#151b24] border border-gray-700 hover:border-cyan-500 px-4 py-2 rounded-lg text-sm font-semibold"
      >
        🔄 Refresh
      </button>

    </div>

    {/* ERROR */}

    {withdrawalError && (
      <div className="bg-red-500/10 border border-red-500/40 text-red-400 p-4 rounded-lg mb-5">
        {withdrawalError}
      </div>
    )}

    {/* LOADING */}

    {withdrawalLoading && (
      <div className="bg-[#151b24] border border-gray-700 rounded-xl p-6 text-gray-400">
        Loading withdrawal requests...
      </div>
    )}

    {/* EMPTY */}

    {!withdrawalLoading &&
      withdrawalRequests.length === 0 &&
      !withdrawalError && (
        <div className="bg-[#151b24] border border-gray-700 rounded-xl p-6 text-gray-400">
          No pending withdrawals 🎉
        </div>
      )}

    {/* REQUESTS */}

    <div className="space-y-4">

      {withdrawalRequests.map((request) => (

        <div
          key={request.id}
          className="bg-[#151b24] border border-gray-700 rounded-xl p-5"
        >

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            <p>
              <span className="text-gray-400">
                Amount:
              </span>{" "}
              <strong className="text-green-400">
                ₹{request.amount}
              </strong>
            </p>

            <p>
              <span className="text-gray-400">
                UPI ID:
              </span>{" "}
              <strong>
                {request.upiId}
              </strong>
            </p>

            <p>
              <span className="text-gray-400">
                User Email:
              </span>{" "}
              {request.user?.email || "-"}
            </p>

            <p>
              <span className="text-gray-400">
                Requested At:
              </span>{" "}
              {request.createdAt
                ? new Date(
                    request.createdAt
                  ).toLocaleString()
                : "-"}
            </p>

          </div>

          <div className="flex flex-wrap gap-3 mt-5">

            {/* APPROVE */}

            <button
              onClick={() =>
                handleWithdrawalAction(
                  request,
                  "APPROVE"
                )
              }
              disabled={
                withdrawalProcessingId ===
                request.id
              }
              className="bg-green-500 hover:bg-green-400 disabled:bg-gray-600 text-black px-5 py-2.5 rounded-lg font-bold"
            >
              {withdrawalProcessingId ===
              request.id
                ? "Processing..."
                : "✓ Mark as Paid / Approve"}
            </button>

            {/* REJECT */}

            <button
              onClick={() =>
                handleWithdrawalAction(
                  request,
                  "REJECT"
                )
              }
              disabled={
                withdrawalProcessingId ===
                request.id
              }
              className="bg-red-500 hover:bg-red-400 disabled:bg-gray-600 text-white px-5 py-2.5 rounded-lg font-bold"
            >
              {withdrawalProcessingId ===
              request.id
                ? "Processing..."
                : "✕ Reject & Refund"}
            </button>

          </div>

        </div>

      ))}

    </div>

  </section>
)}

       

        {/* ==================================
            NOTIFICATIONS
        ================================== */}

        {activeTab === "notifications" && (

          <section>

            <h2 className="text-2xl font-bold text-cyan-400">
              🔔 Global Notifications
            </h2>

            <p className="text-gray-400 mt-2 mb-6">
              Send a push notification to all users who
              have notifications enabled.
            </p>

            <div className="bg-[#151b24] border border-cyan-500/40 rounded-xl p-5 md:p-6">

              {/* TITLE */}

              <label className="block text-sm text-gray-400 mb-2">
                Notification Title
              </label>

              <input
                type="text"
                value={notificationTitle}
                onChange={(e) =>
                  setNotificationTitle(e.target.value)
                }
                placeholder="🔥 New Tournament Is Here!"
                maxLength={100}
                className="w-full p-3 rounded-lg bg-[#0b0f17] border border-gray-700 focus:border-cyan-500 outline-none"
              />

              {/* MESSAGE */}

              <label className="block text-sm text-gray-400 mt-5 mb-2">
                Notification Message
              </label>

              <textarea
                value={notificationMessage}
                onChange={(e) =>
                  setNotificationMessage(e.target.value)
                }
                placeholder="Join the new tournament now and win exciting rewards! 🏆"
                maxLength={500}
                rows={4}
                className="w-full p-3 rounded-lg bg-[#0b0f17] border border-gray-700 focus:border-cyan-500 outline-none resize-none"
              />

              {/* SEND */}

              <button
                onClick={sendGlobalNotification}
                disabled={sendingNotification}
                className={`mt-5 px-6 py-3 rounded-lg font-bold text-black ${
                  sendingNotification
                    ? "bg-gray-500 cursor-not-allowed"
                    : "bg-cyan-400 hover:bg-cyan-300"
                }`}
              >
                {sendingNotification
                  ? "📤 Sending..."
                  : "📢 Send Global Notification"}
              </button>

            </div>

          </section>

        )}

      </div>

      {/* ======================================
          MANAGE TOURNAMENT MODAL
      ====================================== */}

      {selectedTournament && (

        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">

          <div className="bg-[#151b24] border border-cyan-500 rounded-xl p-6 w-full max-w-[500px]">

            <h2 className="text-2xl font-bold text-cyan-400 mb-6">
              Manage Tournament
            </h2>

            <p className="mb-5 text-gray-300">
              <b>
                {selectedTournament.title}
              </b>
            </p>

            {/* ROOM ID */}

            <label className="text-sm text-gray-400">
              Room ID
            </label>

            <input
              value={roomId}
              onChange={(e) =>
                setRoomId(e.target.value)
              }
              placeholder="Enter Room ID"
              className="w-full mt-2 mb-4 p-3 rounded bg-[#0b0f17] border border-gray-700 outline-none focus:border-cyan-500"
            />

            {/* PASSWORD */}

            <label className="text-sm text-gray-400">
              Room Password
            </label>

            <input
              value={roomPassword}
              onChange={(e) =>
                setRoomPassword(e.target.value)
              }
              placeholder="Enter Room Password"
              className="w-full mt-2 p-3 rounded bg-[#0b0f17] border border-gray-700 outline-none focus:border-cyan-500"
            />

            {/* BUTTONS */}

            <div className="flex justify-end gap-3 mt-6">

              <button
                onClick={() =>
                  setSelectedTournament(null)
                }
                className="bg-red-500 hover:bg-red-400 px-5 py-2 rounded-lg font-bold"
              >
                Close
              </button>

              <button
                onClick={saveRoomDetails}
                className="bg-green-500 hover:bg-green-400 text-black px-5 py-2 rounded-lg font-bold"
              >
                Save & Send
              </button>

            </div>

          </div>

        </div>

      )}

    </main>
  );
}