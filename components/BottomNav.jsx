"use client";

import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { key: "home",    icon: "🏠", label: "Home" },
  { key: "battles", icon: "⚔️", label: "Battles" },
  { key: "pricing", icon: "👑", label: "Pricing", href: "/pricing", locked: true }, // 🔒 not ready yet
  { key: "wallet",  icon: "💳", label: "Rewards" },
  { key: "profile", icon: "👤", label: "Profile" },
];

export default function BottomNav({ activeTab = "home", onNavigate = () => {} }) {
  const router = useRouter();
  const pathname = usePathname();
  const isPricingPage = pathname === "/pricing";

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#0f141c] border-t border-gray-800 flex justify-around items-center py-2.5 z-40">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.key === "pricing" ? isPricingPage : !isPricingPage && activeTab === item.key;

        return (
          <button
            key={item.key}
            onClick={() => {
              if (item.locked) return; // abhi disabled — koi navigation nahi

              if (item.href) {
                router.push(item.href);
              } else if (isPricingPage) {
                router.push(`/dashboard?tab=${item.key}`);
              } else {
                onNavigate(item.key);
              }
            }}
            disabled={item.locked}
            className={`relative flex flex-col items-center gap-0.5 px-3 transition-colors ${
              item.locked
                ? "text-gray-600 cursor-not-allowed"
                : isActive
                ? "text-cyan-400"
                : "text-gray-500"
            }`}
          >
            <span className="relative text-lg leading-none">
              <span className={item.locked ? "opacity-40 grayscale" : ""}>
                {item.icon}
              </span>
              {item.locked && (
                <span className="absolute -top-2 -right-2 text-[13px] leading-none text-[#3a3f4a]">
                  🔒
                </span>
              )}
            </span>
            <span className="text-[9px] font-bold uppercase">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}