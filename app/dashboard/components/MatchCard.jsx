// app/dashboard/components/MatchCard.jsx
'use client';
import React, { useState } from 'react';

export default function MatchCard({ match, onUploadScreenshot }) {
  const [screenshot, setScreenshot] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setScreenshot(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!screenshot) {
      alert("Pehle screenshot select karo bhai!");
      return;
    }
    setLoading(true);
    await onUploadScreenshot(match.id, screenshot);
    setLoading(false);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4 text-white shadow-lg">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-bold text-indigo-400">{match.name}</h3>
        <span className="text-xs bg-gray-800 px-3 py-1 rounded-full text-gray-300">
          Prize: ₹{match.prize}
        </span>
      </div>
      
      <p className="text-sm text-gray-400 mb-4">Room ID & Password match start hone se 10 min pehle milega.</p>

      {/* Screenshot Upload Section */}
      <div className="border-t border-gray-800 pt-3 flex flex-col sm:flex-row items-center gap-3">
        <input 
          type="file" 
          accept="image/*"
          onChange={handleFileChange}
          className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
        />
        <button 
          onClick={handleSubmit}
          disabled={loading}
          className="w-full sm:w-auto px-5 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 rounded-lg text-sm font-medium transition"
        >
          {loading ? "Uploading..." : "Upload SS"}
        </button>
      </div>
    </div>
  );
}