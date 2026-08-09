"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function AdminPage() {
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);

  const [roomId, setRoomId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");

  // Global notification states
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);

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

  const handleManageTournament = (tournament) => {
    setSelectedTournament(tournament);

    setRoomId(tournament.roomId || "");
    setRoomPassword(tournament.roomPassword || "");
  };

  // ================================
  // SAVE ROOM DETAILS
  // ================================
  const saveRoomDetails = async () => {
    if (!selectedTournament) return;

    if (!roomId.trim() || !roomPassword.trim()) {
      alert("❌ Room ID and Room Password are required");
      return;
    }

    try {
      // 1. Save room details in Firebase
      await updateDoc(
        doc(db, "tournaments", selectedTournament.id),
        {
          roomId: roomId.trim(),
          roomPassword: roomPassword.trim(),
        }
      );

      // 2. Send personal notifications to joined players
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
          result.message || result.error || "Failed to send room details"
        );
      }

      alert("✅ Room Details Saved & Notifications Sent");

      setSelectedTournament(null);
    } catch (error) {
      console.error("Room details error:", error);
      alert("❌ " + error.message);
    }
  };

  // ================================
  // SEND GLOBAL NOTIFICATION
  // ================================
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

  return (
    <main className="min-h-screen bg-[#0b0f17] text-white p-4 md:p-8">

      {/* HEADER */}
      <h1 className="text-3xl font-bold text-cyan-400">
        Battle Crown Admin Panel
      </h1>

      <p className="text-gray-400 mt-2">
        Manage tournaments, room details and notifications.
      </p>

      {/* ADMIN CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">

        <div className="bg-[#151b24] border border-gray-700 p-6 rounded-lg">
          <h2 className="text-xl font-bold">
            🎮 Tournaments
          </h2>

          <p className="text-gray-400 mt-2">
            Create & Edit Tournament
          </p>
        </div>

        <div className="bg-[#151b24] border border-cyan-500 p-6 rounded-lg">
          <h2 className="text-xl font-bold">
            📢 Notifications
          </h2>

          <p className="text-gray-400 mt-2">
            Send Global & Personal Notifications
          </p>
        </div>

        <div className="bg-[#151b24] border border-gray-700 p-6 rounded-lg">
          <h2 className="text-xl font-bold">
            🏆 Match Verification
          </h2>

          <p className="text-gray-400 mt-2">
            Verify Match Results
          </p>
        </div>

      </div>

      {/* ================================= */}
      {/* GLOBAL NOTIFICATION */}
      {/* ================================= */}

      <section className="mt-10 bg-[#151b24] border border-cyan-500 rounded-xl p-6">

        <h2 className="text-2xl font-bold text-cyan-400">
          📢 Global Notification
        </h2>

        <p className="text-gray-400 mt-2 mb-6">
          Send a push notification to all users who have notifications enabled.
        </p>

        {/* TITLE */}
        <label className="block text-sm text-gray-400 mb-2">
          Notification Title
        </label>

        <input
          type="text"
          value={notificationTitle}
          onChange={(e) => setNotificationTitle(e.target.value)}
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
          onChange={(e) => setNotificationMessage(e.target.value)}
          placeholder="Join the new tournament now and win exciting rewards! 🏆"
          maxLength={500}
          rows={4}
          className="w-full p-3 rounded-lg bg-[#0b0f17] border border-gray-700 focus:border-cyan-500 outline-none resize-none"
        />

        {/* SEND BUTTON */}
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

      </section>

      {/* ================================= */}
      {/* ACTIVE TOURNAMENTS */}
      {/* ================================= */}

      <div className="mt-10">

        <h2 className="text-2xl font-bold text-cyan-400 mb-5">
          Active Tournaments
        </h2>

        <div className="space-y-4">

          {tournaments.length === 0 ? (
            <div className="bg-[#151b24] border border-gray-700 rounded-lg p-5 text-gray-400">
              No tournaments found.
            </div>
          ) : (
            tournaments.map((tournament) => (

              <div
                key={tournament.id}
                className="bg-[#151b24] border border-gray-700 rounded-lg p-5 flex flex-col md:flex-row justify-between gap-4 md:items-center"
              >

                <div>

                  <h3 className="text-xl font-bold">
                    {tournament.title || "Untitled Tournament"}
                  </h3>

                  <p className="text-gray-400">
                    {tournament.game || "Game not specified"}
                  </p>

                  <p className="text-green-400">
                    Joined:{" "}
                    {tournament.joinedCount ?? 0}/
                    {tournament.maxSlots ?? 100}
                  </p>

                </div>

                <button
                  onClick={() =>
                    handleManageTournament(tournament)
                  }
                  className="bg-cyan-500 hover:bg-cyan-400 text-black px-5 py-2 rounded font-bold"
                >
                  Manage
                </button>

              </div>

            ))
          )}

        </div>

      </div>

      {/* ================================= */}
      {/* MANAGE TOURNAMENT MODAL */}
      {/* ================================= */}

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

            {/* ROOM PASSWORD */}

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
                className="bg-red-500 hover:bg-red-400 px-5 py-2 rounded font-bold"
              >
                Close
              </button>

              <button
                onClick={saveRoomDetails}
                className="bg-green-500 hover:bg-green-400 text-black px-5 py-2 rounded font-bold"
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