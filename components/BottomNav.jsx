"use client";

// ─────────────────────────────────────────────────────────────────────────
// BottomNav — shared across Home / Battles / Wallet / Profile so the four
// tabs always agree on what's active. Pass the current tab key and a
// callback; this component owns no state of its own.
// ─────────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: "home", icon: "🏠", label: "Home" },
  { key: "battles", icon: "⚔️", label: "Battles" },
  { key: "wallet", icon: "💼", label: "Wallet" },
  { key: "profile", icon: "👤", label: "Profile" },
];

export default function BottomNav({ activeTab = "home", onNavigate = () => {} }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#0f141c] border-t border-gray-800 flex justify-around items-center py-2.5 z-40">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          onClick={() => onNavigate(item.key)}
          className={`flex flex-col items-center gap-0.5 px-3 transition-colors ${
            activeTab === item.key ? "text-cyan-400" : "text-gray-500"
          }`}
        >
          <span className="text-lg leading-none">{item.icon}</span>
          <span className="text-[9px] font-bold uppercase">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}