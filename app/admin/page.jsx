"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

export default function AdminPage() {

  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [roomId, setRoomId] = useState("");
const [roomPassword, setRoomPassword] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "tournaments"),
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setTournaments(list);
      }
    );

    return () => unsubscribe();
  }, []);

 const handleManageTournament = (tournament) => {

  setSelectedTournament(tournament);

  setRoomId(tournament.roomId || "");

  setRoomPassword(tournament.roomPassword || "");

};

const saveRoomDetails = async () => {
  if (!selectedTournament) return;

  try {
    // 1. Firebase me Room Details save karo
    await updateDoc(
      doc(db, "tournaments", selectedTournament.id),
      {
        roomId,
        roomPassword,
      }
    );

    // 2. Backend API ko call karo
    const response = await fetch("/api/admin/send-room-details", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tournamentId: selectedTournament.id,
        roomId,
        roomPassword,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message);
    }

    alert("✅ Room Details Saved & Notifications Sent");

    setSelectedTournament(null);

  } catch (err) {
    console.error(err);
    alert("❌ " + err.message);
  }
};

  return (
    
    <main className="min-h-screen bg-[#0b0f17] text-white p-8">

      <h1 className="text-3xl font-bold text-cyan-400">
        Battle Crown Admin Panel
      </h1>

      <p className="text-gray-400 mt-2">
        Manage tournaments, room details and notifications.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">

  <div className="bg-[#151b24] border border-gray-700 p-6 rounded-lg">
    <h2 className="text-xl font-bold">🎮 Tournaments</h2>
    <p className="text-gray-400 mt-2">
      Create & Edit Tournament
    </p>
  </div>

  <div className="bg-[#151b24] border border-gray-700 p-6 rounded-lg">
    <h2 className="text-xl font-bold">📢 Notifications</h2>
    <p className="text-gray-400 mt-2">
      Send Global & Personal Notifications
    </p>
  </div>

  <div className="bg-[#151b24] border border-gray-700 p-6 rounded-lg">
    <h2 className="text-xl font-bold">🏆 Match Verification</h2>
    <p className="text-gray-400 mt-2">
      Verify Match Results
    </p>
  </div>

</div>

{/* Active Tournaments */}

<div className="mt-10">

  <h2 className="text-2xl font-bold text-cyan-400 mb-5">
    Active Tournaments
  </h2>

  <div className="space-y-4">

    {tournaments.map((tournament) => (

      <div
        key={tournament.id}
        className="bg-[#151b24] border border-gray-700 rounded-lg p-5 flex justify-between items-center"
      >

        <div>

          <h3 className="text-xl font-bold">
            {tournament.title}
          </h3>

          <p className="text-gray-400">
            {tournament.game}
          </p>

          <p className="text-green-400">
            Joined : {tournament.joinedCount ?? 0}/{tournament.maxSlots ?? 100}
          </p>

        </div>

        <button
          onClick={() => handleManageTournament(tournament)}
          className="bg-cyan-500 hover:bg-cyan-400 text-black px-5 py-2 rounded font-bold"
        >
          Manage
        </button>

      </div>

    ))}

  </div>

</div>

{selectedTournament && (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">

    <div className="bg-[#151b24] border border-cyan-500 rounded-xl p-6 w-[500px]">

      <h2 className="text-2xl font-bold text-cyan-400 mb-6">
        Manage Tournament
      </h2>

      <p className="mb-5 text-gray-300">
        <b>{selectedTournament.title}</b>
      </p>

      <label className="text-sm text-gray-400">
        Room ID
      </label>

      <input
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        placeholder="Enter Room ID"
        className="w-full mt-2 mb-4 p-3 rounded bg-[#0b0f17] border border-gray-700"
      />

      <label className="text-sm text-gray-400">
        Room Password
      </label>

      <input
        value={roomPassword}
        onChange={(e) => setRoomPassword(e.target.value)}
        placeholder="Enter Room Password"
        className="w-full mt-2 p-3 rounded bg-[#0b0f17] border border-gray-700"
      />

      <div className="flex justify-end gap-3 mt-6">

        <button
          onClick={() => setSelectedTournament(null)}
          className="bg-red-500 px-5 py-2 rounded"
        >
          Close
        </button>

        <button
          onClick={saveRoomDetails}
          className="bg-green-500 text-black px-5 py-2 rounded font-bold"
        >
          Save
        </button>

      </div>

    </div>

  </div>
)}
 
</main>
  );
}