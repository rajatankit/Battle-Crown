"use client";

import { useState, useEffect } from "react";

export default function SlidesGalleryModal({
  game = "ff",          // "ff" or "bgmi"
  onSelect,
  onClose,
}) {
  const [slides, setSlides] = useState([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const limit = 8;

  useEffect(() => {
    async function loadSlides() {
      setLoading(true);
      try {
        // Yahan Cloudinary ya local API call hogi
        const res = await fetch(`/api/slides?game=\( {game}&page= \){page}&limit=${limit}`);
        const data = await res.json();
        setSlides(data.slides || []);
      } catch (err) {
        console.error("Failed to load slides:", err);
        setSlides([]);
      } finally {
        setLoading(false);
      }
    }
    loadSlides();
  }, [game, page]);

  const handleSelect = (slide) => {
    setSelected(slide);
  };

  const confirmSelect = () => {
    if (selected) {
      onSelect(selected.url); // sirf URL bhej rahe hain
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md">
      {/* Background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(180,0,0,0.15),transparent_70%)] pointer-events-none" />

      <div className="relative w-full max-w-5xl mx-4 rounded-2xl border border-red-900/50 bg-gradient-to-b from-zinc-950 to-black shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-900/30">
          <div>
            <h2 className="text-red-500 font-bold tracking-[0.25em] text-sm">
              SELECT TOURNAMENT SLIDE
            </h2>
            <p className="text-gray-500 text-xs mt-1 uppercase tracking-widest">
              {game === "ff" ? "Free Fire" : "BGMI"} • Page {page}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-red-400 transition text-xl"
          >
            ✕
          </button>
        </div>

        {/* Slides Grid */}
        <div className="p-6">
          {loading ? (
            <div className="h-64 flex items-center justify-center text-gray-500">
              Loading slides...
            </div>
          ) : slides.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No slides found
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {slides.map((slide) => (
                <div
                  key={slide.id}
                  onClick={() => handleSelect(slide)}
                  className={`relative aspect-video rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-300
                    ${selected?.id === slide.id
                      ? "border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.6)] scale-105"
                      : "border-transparent hover:border-red-800/60"
                    }`}
                >
                  <img
                    src={slide.url}
                    alt="slide"
                    className="w-full h-full object-cover"
                  />
                  {selected?.id === slide.id && (
                    <div className="absolute inset-0 bg-red-600/20 flex items-center justify-center">
                      <span className="bg-red-600 text-white text-xs px-3 py-1 rounded-full font-bold tracking-wider">
                        SELECTED
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-red-900/30 bg-black/40">
          <div className="flex gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-gray-300 hover:border-red-700 disabled:opacity-40 transition"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-gray-300 hover:border-red-700 transition"
            >
              Next →
            </button>
          </div>

          <button
            onClick={confirmSelect}
            disabled={!selected}
            className="px-8 py-2.5 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition shadow-[0_0_20px_rgba(185,28,28,0.4)]"
          >
            CONFIRM SLIDE
          </button>
        </div>
      </div>
    </div>
  );
}