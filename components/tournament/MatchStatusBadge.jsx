// components/tournament/MatchStatusBadge.jsx
//
// Drop this in wherever a player views their match after uploading a
// result screenshot — right after the upload call resolves, and on
// any "my matches" list.

export default function MatchStatusBadge({ resultStatus }) {
  const map = {
    UNVERIFIED: {
      label: "Verification pending",
      cls: "bg-[#241D0F] text-[#E8B04B] border-[#3D2F14]",
    },
    ADMIN_REVIEW: {
      label: "Under review",
      cls: "bg-[#141C2A] text-[#5B9BD5] border-[#1E3A5C]",
    },
    VERIFIED: {
      label: "Verified",
      cls: "bg-[#10231D] text-[#3FB88F] border-[#1D4A3B]",
    },
    REJECTED: {
      label: "Rejected",
      cls: "bg-[#2A1414] text-[#E5615B] border-[#4A1D1D]",
    },
  };
  const s = map[resultStatus] || map.UNVERIFIED;

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}