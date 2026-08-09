"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import GamingWallet from "../../components/GamingWallet";
import { Headphones, Send } from "lucide-react";
import { collection, onSnapshot, doc, updateDoc, arrayUnion, increment } from "firebase/firestore";
import  MatchCountdown from "../../components/MatchCountdown";
import NotificationBell from "../../components/NotificationBell";

// Level/XP logic lives in one shared file, imported by both this page and
// the /api/tournament/join route — this is what keeps the DB's level and
// the UI's level from ever drifting apart. Don't redefine these locally.
import { getTotalMatchesForLevel, levelBadgesMap, MAX_PLAYER_LEVEL, calculateLevelFromMatches } from "../lib/levelConfig";

const MAX_LEVEL = MAX_PLAYER_LEVEL;

// ─── Crown Reward Table ───────────────────────────────────────────────────────
const CROWN_REWARD_TABLE = [
  { level: 1,  crowns: 5,   bumper: false },
  { level: 5,  crowns: 10,  bumper: false },
  { level: 10, crowns: 25,  bumper: true  },
  { level: 15, crowns: 20,  bumper: false },
  { level: 20, crowns: 50,  bumper: true  },
  { level: 25, crowns: 30,  bumper: false },
  { level: 30, crowns: 40,  bumper: false },
  { level: 35, crowns: 50,  bumper: false },
  { level: 40, crowns: 100, bumper: true  },
  { level: 45, crowns: 80,  bumper: false },
  { level: 50, crowns: 200, bumper: true  },
];

function getCrownRewardForLevel(level) {
  const entry = CROWN_REWARD_TABLE.find((r) => r.level === level);
  return entry ? entry.crowns : 0;
}

export default function DashboardPage() {
  const router = useRouter();
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [tournaments, setTournaments] = useState([]);

 // Live tournaments (Firestore realtime)
useEffect(() => {
  const unsubscribe = onSnapshot(collection(db, "tournaments"), (snapshot) => {
    const list = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,
      };
    });
    setTournaments(list);
  });
  return () => unsubscribe();
}, []);

  // Join tournament (Firestore)
  const handleJoinTournament = async (tournament) => {
    if (!firebaseUser) { alert("Please log in first."); return; }
    if (tournament.participants?.includes(firebaseUser.uid)) {
      alert("You've already joined this tournament."); return;
    }
    const maxAllowedSlots = tournament.maxSlots || 100;
    if ((tournament.joinedCount || 0) >= maxAllowedSlots) {
      alert("Sorry, all slots are full."); return;
    }
    try {
      await updateDoc(doc(db, "tournaments", tournament.id), {
        joinedCount: increment(1),
        participants: arrayUnion(firebaseUser.uid),
      });
      alert("Successfully joined the tournament!");
    } catch (error) {
      console.error("Error joining tournament: ", error);
    }
  };

  // ─── Wallet & Crown States ──────────────────────────────────────────────────
  const [depositWallet, setDepositWallet]   = useState(0);
  const [winningsWallet, setWinningsWallet] = useState(0);
  const [crowns, setCrowns]                 = useState(0);

  // ─── Screenshot Upload States ───────────────────────────────────────────────
  const [matchScreenshot, setMatchScreenshot] = useState(null);
  const [uploadingSS, setUploadingSS]         = useState(false);

  // ─── Player Level / XP / Protection ────────────────────────────────────────
  const [playerLevel, setPlayerLevel]             = useState(1);
  const [matchesPlayed, setMatchesPlayed]         = useState(0);
  const [protectionPoints, setProtectionPoints]   = useState(5);
  const [isLevelModalOpen, setIsLevelModalOpen]   = useState(false);

  // Crown level-up notification
  const [levelUpCrownMsg, setLevelUpCrownMsg] = useState(null);
  const prevLevelRef = useRef(null);

  // ─── 2D Info / XP Info Modals (realtime tooltip style) ─────────────────────
  const [redeemMessage, setRedeemMessage]               = useState(null);
  const [inactivityModalMessage, setInactivityModalMessage] = useState(null);
  const [xpModalMessage, setXpModalMessage]             = useState(null);

  // ─── UPI / Withdraw Modals ──────────────────────────────────────────────────
  const [isUpiModalOpen, setIsUpiModalOpen]         = useState(false);
  const [addAmount, setAddAmount]                   = useState(100);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount]         = useState("");
  const [withdrawUpiId, setWithdrawUpiId]           = useState("");
  const [withdrawMessage, setWithdrawMessage]       = useState(null);

  // ─── About / Support Modals ─────────────────────────────────────────────────
  const [isAboutModalOpen, setIsAboutModalOpen]     = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [supportQuery, setSupportQuery]             = useState("");
  const [shareMessage, setShareMessage]             = useState(null);

  // ─── Multi-Step Tournament Join ─────────────────────────────────────────────
  const [activeMatch, setActiveMatch]                   = useState(null);
  const [isRulesModalOpen, setIsRulesModalOpen]         = useState(false);
  const [hasAgreedRules, setHasAgreedRules]             = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen]     = useState(false);
  const [isDetailsFormModalOpen, setIsDetailsFormModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen]     = useState(false);

  // ─── Player Form Inputs ─────────────────────────────────────────────────────
  const [playerWhatsapp, setPlayerWhatsapp]     = useState("");
  const [playerEmailInput, setPlayerEmailInput] = useState("");
  const [playerIgnInput, setPlayerIgnInput]     = useState("");
  const [playerUidInput, setPlayerUidInput]     = useState("");
  const [userEmail, setUserEmail]               = useState("");

  // ─── Game Profiles ──────────────────────────────────────────────────────────
  const [bgmiIgn, setBgmiIgn]   = useState("AlphaShadow");
  const [bgmiUid, setBgmiUid]   = useState("5123456789");
  const [ffIgn, setFfIgn]       = useState("FireStorm99");
  const [ffUid, setFfUid]       = useState("9876543210");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [tempBgmiIgn, setTempBgmiIgn] = useState(bgmiIgn);
  const [tempBgmiUid, setTempBgmiUid] = useState(bgmiUid);
  const [tempFfIgn, setTempFfIgn]     = useState(ffIgn);
  const [tempFfUid, setTempFfUid]     = useState(ffUid);

  // ─── Bio ────────────────────────────────────────────────────────────────────
  const [bio, setBio]                 = useState("Ready for the battle! Multi-Game Competitive Esports Player.");
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [tempBio, setTempBio]         = useState(bio);
  const [bioError, setBioError]       = useState(null);

  const [selectedGameTab, setSelectedGameTab] = useState("bgmi");
  // ─── Background slider ──────────────────────────────────────────────────────
  const bgMedia = [
    { type: "image", url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1600&auto=format&fit=crop", game: "BGMI Arena" },
    { type: "image", url: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1600&auto=format&fit=crop", game: "Free Fire Clash" },
  ];
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCurrentBgIndex((p) => (p + 1) % bgMedia.length), 5000);
    return () => clearInterval(timer);
  }, [bgMedia.length]);

// ─── FETCH USER PROFILE ─────────────────────────────────────────────────────
const refreshUserProfile = async (uid, email, displayName) => {
  try {
    // Firebase se current logged-in user ka fresh ID token lo
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("No authenticated user found");
    }
    const idToken = await currentUser.getIdToken();

    // =========================
    // USER PROFILE
    // =========================
    const res = await fetch("/api/user/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        uid,
        email,
        name: displayName || "Player",
      }),
    });
   

    // Pehle response ko text me read karo
    const responseText = await res.text();

    console.log("REGISTER API STATUS:", res.status);
    console.log("REGISTER API RESPONSE:", responseText);

    let data;

    try {
      data = JSON.parse(responseText);
    } catch (jsonError) {
      throw new Error(
        `Register API JSON nahi bhej rahi. Status: ${res.status}. Response: ${responseText.slice(
          0,
          200
        )}`
      );
    }

    if (!res.ok) {
      throw new Error(data?.error || "Failed to load user profile");
    }

    if (data?.user) {
      setDepositWallet(data.user.depositWallet ?? 0);
      setWinningsWallet(data.user.winningsWallet ?? 0);
      setCrowns(data.user.crowns ?? 0);

      const totalMatches = data.user.matchesPlayed ?? 0;
      setMatchesPlayed(totalMatches);

      const derivedLevel = calculateLevelFromMatches(totalMatches);
      setPlayerLevel(derivedLevel);
      

      setBgmiIgn(data.user.bgmiIgn || "AlphaShadow");
      setBgmiUid(data.user.bgmiUid || "5123456789");
      setFfIgn(data.user.ffIgn || "FireStorm99");
      setFfUid(data.user.ffUid || "9876543210");
      setBio(data.user.bio || "Ready for the battle! Multi-Game Competitive Esports Player.");
      setTempBgmiIgn(data.user.bgmiIgn || "AlphaShadow");
      setTempBgmiUid(data.user.bgmiUid || "5123456789");
      setTempFfIgn(data.user.ffIgn || "FireStorm99");
      setTempFfUid(data.user.ffUid || "9876543210");
      setTempBio(data.user.bio || "Ready for the battle! Multi-Game Competitive Esports Player.");

      // Fetch match history
    try {
      const mhRes = await fetch(`/api/user/match-history?email=${encodeURIComponent(email)}`);
      const mhData = await mhRes.json();
      if (mhData.success) setMatchHistory(mhData.matches);
    } catch (mhErr) {
      console.error("Match history fetch error:", mhErr);
    }
    }

    // =========================
    // PROTECTION STATUS
    // =========================
    const protRes = await fetch(
      `/api/user/protection-status?email=${encodeURIComponent(email)}`
    );

    const protText = await protRes.text();

    console.log("PROTECTION API STATUS:", protRes.status);
    console.log("PROTECTION API RESPONSE:", protText);

    let protData;

    try {
      protData = JSON.parse(protText);
    } catch (jsonError) {
      throw new Error(
        `Protection API JSON nahi bhej rahi. Status: ${
          protRes.status
        }. Response: ${protText.slice(0, 200)}`
      );
    }

    if (!protRes.ok) {
      throw new Error(
        protData?.error || "Failed to load protection status"
      );
    }

    if (protData?.success) {
      setProtectionPoints(protData.protectionPoints ?? 0);
    }
  } catch (err) {
    console.error("Profile refresh error:", err);
  }
};

// ─── Auth State Listener — triggers profile load & stops loading screen ────
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      setFirebaseUser(user);
      setUserEmail(user.email || "");
      setPlayerEmailInput(user.email || "");
      await refreshUserProfile(user.uid, user.email, user.displayName);
      setLoading(false);
    } else {
      setLoading(false);
      router.push("/login");
    }
  });

  return () => unsubscribe();
}, []);

// ─── Auto-refresh wallet/level every 15 seconds — no manual refresh needed ──
useEffect(() => {
  if (!firebaseUser) return;

  const interval = setInterval(() => {
    refreshUserProfile(firebaseUser.uid, firebaseUser.email, firebaseUser.displayName);
  }, 15000); // har 15 second

  return () => clearInterval(interval);
}, [firebaseUser]);


  // ─── Recompute level whenever matchesPlayed changes ────────────────────────
  useEffect(() => {
    const derivedLevel = calculateLevelFromMatches(matchesPlayed);
    if (derivedLevel !== playerLevel) {
      setPlayerLevel(derivedLevel);
    }
  }, [matchesPlayed]);



  // ─── Level-up Crown Reward Watcher ──────────────────────────────────────────
useEffect(() => {
  if (prevLevelRef.current === null) {
    prevLevelRef.current = playerLevel;
    return;
  }

  if (playerLevel <= prevLevelRef.current) return;

  const oldLevel = prevLevelRef.current;

  fetch("/api/wallet/add-crown", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: userEmail,
      level: playerLevel,
    }),
  })
    .then((r) => r.json())
    .then((d) => {
      if (d.success) {
        setCrowns(d.crowns);

        if (!d.alreadyClaimed && d.reward > 0) {
          const reachedLevels = d.levelsRewarded || [];

          const rewardText = reachedLevels
            .map((level) => {
              const reward = getCrownRewardForLevel(level);
              return `Level ${level}: +${reward} 👑`;
            })
            .join("  ");

          setLevelUpCrownMsg(
            `🏆 Level Up! You reached Level ${playerLevel} — ${rewardText}`
          );

          setTimeout(() => {
            setLevelUpCrownMsg(null);
          }, 5000);
        }
      } else {
        console.error("Crown reward failed:", d.message);
      }
    })
    .catch((error) => {
      console.error("Crown reward error:", error);
    });

  prevLevelRef.current = playerLevel;
}, [playerLevel]);

  const handleLogout = async () => {
    try { await signOut(auth); router.push("/login"); }
    catch (error) { console.error("Logout error:", error); }
  };

  // ─── Badges Config ──────────────────────────────────────────────────────────
  const levelBadgesMap = [
    { level: 1,  name: "Rookie Bronze",     badge: "🥉" },
    { level: 5,  name: "Iron Vanguard",     badge: "🛡️" },
    { level: 10, name: "Silver Striker",    badge: "🥈" },
    { level: 15, name: "Gold Gladiator",    badge: "🥇" },
    { level: 20, name: "Platinum Elite",    badge: "💎" },
    { level: 25, name: "Diamond Predator",  badge: "💠" },
    { level: 30, name: "Crown Master",      badge: "👑" },
    { level: 35, name: "Ace Conqueror",     badge: "⚡" },
    { level: 40, name: "Legendary Titan",   badge: "🌟" },
    { level: 45, name: "Master Immortal",   badge: "🔥" },
    { level: 50, name: "Mythic Supreme",    badge: "🏆" },
  ];

  const getUnlockedBadges = () => levelBadgesMap.filter((b) => playerLevel >= b.level);

  const getCurrentTierInfo = () => {
    let current = levelBadgesMap[0];
    for (const tier of levelBadgesMap) {
      if (playerLevel >= tier.level) current = tier;
    }
    return { current };
  };
  const { current: currentTier } = getCurrentTierInfo();

  // ─── Derived XP progress (for current level) ────────────────────────────────
  const totalForCurrentLevel = getTotalMatchesForLevel(playerLevel);
  const totalForNextLevel    = getTotalMatchesForLevel(Math.min(playerLevel + 1, MAX_LEVEL));
  const matchesTowardNext    = playerLevel >= MAX_LEVEL ? 0 : Math.max(matchesPlayed - totalForCurrentLevel, 0);
  const matchesNeededForNext = playerLevel >= MAX_LEVEL ? 0 : Math.max(totalForNextLevel - totalForCurrentLevel, 1);

  // ─── Pagination ─────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;
  const filteredTournaments = tournaments.filter((t) =>
    !selectedGameTab || t.game?.toLowerCase().includes(selectedGameTab.toLowerCase())
  );
  const totalPages = Math.ceil(filteredTournaments.length / itemsPerPage);
  const displayedTournaments = filteredTournaments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

 // ─── Match History ──────────────────────────────────────────────────────────
const [matchHistory, setMatchHistory] = useState([]);

const addMatchHistoryRecord = (
  tournamentName,
  mapName,
  gameType,
  entryPaid,
  dbMatchId
) => {
  const newRecord = {
    id: Date.now(),
    dbMatchId,
    tournamentName,
    mapName,
    gameType,
    playerLevel,
    joinTime: new Date().toISOString(),
    entryPaid,
    screenshotUrl: null,
  };

  setMatchHistory((prev) => [newRecord, ...prev].slice(0, 5));
};


// ─── Upload Match Screenshot ────────────────────────────────────────────────
const handleUploadScreenshot = async (tournamentName, dbMatchId) => {
  console.log("Uploading Match ID:", dbMatchId);

  if (!matchScreenshot) {
    alert("Pehle screenshot select karo!");
    return;
  }

  if (!dbMatchId) {
    alert("Match ID nahi mila. Match ko dobara join karo.");
    return;
  }

  if (!userEmail) {
    alert("User email nahi mila. Please page refresh karo.");
    return;
  }

  setUploadingSS(true);

  const formData = new FormData();

  formData.append("file", matchScreenshot);
  formData.append("email", userEmail);
  formData.append("matchId", String(dbMatchId));
  formData.append("tournamentName", tournamentName || "");

  try {
    const res = await fetch("/api/match/upload-ss", {
      method: "POST",
      body: formData,
    });

    console.log("Upload SS status:", res.status);
    console.log(
      "Upload SS content-type:",
      res.headers.get("content-type")
    );

    // JSON directly parse mat karo.
    // Pehle text lo taaki <!DOCTYPE html> aaye to exact error pata chale.
    const responseText = await res.text();

    console.log("Upload SS response:", responseText);

    let data;

    try {
      data = JSON.parse(responseText);
    } catch (jsonError) {
      console.error("Invalid JSON response:", jsonError);

      throw new Error(
        `Upload API JSON nahi de rahi. Status: ${res.status}. Response: ${responseText.slice(
          0,
          200
        )}`
      );
    }

    if (!res.ok) {
      throw new Error(
        data?.error ||
        data?.message ||
        `Upload failed with status ${res.status}`
      );
    }

    if (data.success) {
      alert(
        "🎉 Match screenshot successfully upload ho gaya! Admin verify hone ke baad winning wallet me add kar diya jayega."
      );

      setMatchScreenshot(null);

      setMatchHistory((prev) =>
        prev.map((m) =>
          String(m.dbMatchId) === String(dbMatchId)
            ? {
                ...m,
                screenshotUrl:
                  data?.matchRecord?.screenshotUrl || null,
              }
            : m
        )
      );
    } else {
      alert(
        "Error: " +
          (data?.error ||
            data?.message ||
            "Screenshot upload failed.")
      );
    }
  } catch (err) {
    console.error("Upload Error:", err);

    alert(
      err?.message ||
        "Kuch gadbad ho gayi, dubara try karo."
    );
  } finally {
    setUploadingSS(false);
  }
};


// ─── Time Ago ────────────────────────────────────────────────────────────────
const getTimeAgo = (dateString) => {
  if (!dateString) return "Just now";

  const diff = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000
  );

  if (diff < 60) return "Just now";

  const m = Math.floor(diff / 60);

  if (m < 60) {
    return `${m} mins ago`;
  }

  const h = Math.floor(m / 60);

  if (h < 24) {
    return `${h} hours ago`;
  }

  return `${Math.floor(h / 24)} days ago`;
};


// ─── XP Info ─────────────────────────────────────────────────────────────────
const handleXpInfoClick = () => {
  setXpModalMessage(
    "Match XP increases automatically every time you join and complete a tournament match. Keep playing regularly to level up."
  );

  setTimeout(() => {
    setXpModalMessage(null);
  }, 4000);
};


// ─── Inactivity Info ─────────────────────────────────────────────────────────
const handleInactivityInfoClick = () => {
  setInactivityModalMessage(
    protectionPoints > 0
      ? `🛡️ Protection active: your rank is currently safeguarded. If you stay inactive for more than 2 days, 1 Protection Point will be used automatically to prevent an XP or rank drop.`
      : `⚠️ You have 0 Protection Points left. If you stay inactive for more than 2 days without joining a match, your XP and rank tier may be penalized.`
  );

  setTimeout(() => {
    setInactivityModalMessage(null);
  }, 4000);
};


// ─── Share Match ─────────────────────────────────────────────────────────────
const handleShareMatch = (match) => {
  const shareText =
    `I just joined ${match.tournamentName} (${match.mapName}) on Battle Crown! ` +
    `Join in and compete for cash prizes. 🏆`;

  if (navigator.share) {
    navigator
      .share({
        title: "Battle Crown Match",
        text: shareText,
        url: window.location.href,
      })
      .catch(() => {});
  } else {
    navigator.clipboard
      .writeText(shareText)
      .then(() => {
        setShareMessage("Match details copied to clipboard.");

        setTimeout(() => {
          setShareMessage(null);
        }, 3000);
      })
      .catch(() => {
        setShareMessage("Copy failed.");
      });
  }
};


// ─── Crown Redeem ────────────────────────────────────────────────────────────
const handleRedeemTicket = async () => {
  if (crowns < 20) {
    setRedeemMessage(
      `You need 20 Crowns to redeem (current: ${crowns} 👑).`
    );

    setTimeout(() => {
      setRedeemMessage(null);
    }, 4000);

    return;
  }

  try {
    const res = await fetch("/api/wallet/redeem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: userEmail,
      }),
    });

    console.log("Redeem status:", res.status);

    const responseText = await res.text();

    console.log("Redeem response:", responseText);

    let data;

    try {
      data = JSON.parse(responseText);
    } catch (jsonError) {
      console.error("Redeem invalid JSON:", jsonError);

      throw new Error(
        `Redeem API JSON nahi de rahi. Status: ${res.status}`
      );
    }

    if (!res.ok) {
      throw new Error(
        data?.error ||
          data?.message ||
          `Redemption failed: ${res.status}`
      );
    }

    if (data.success) {
      setCrowns(data.crowns ?? 0);
      setDepositWallet(data.depositWallet ?? 0);

      setRedeemMessage(
        "Success! 20 Crowns redeemed for a free ₹10 match ticket."
      );
    } else {
      setRedeemMessage(
        data?.error ||
          data?.message ||
          "Redemption failed."
      );
    }
  } catch (err) {
    console.error("Redeem Error:", err);

    setRedeemMessage(
      err?.message ||
        "Server error during redemption."
    );
  }

  setTimeout(() => {
    setRedeemMessage(null);
  }, 4000);
};


  // ─── Tournament Card Component ──────────────────────────────────────────────
  function TournamentCard({ tournament }) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const gameName    = (tournament.game || tournament.gameType || tournament.title || "").toLowerCase();
    const isFreeFire  = gameName.includes("free") || gameName.includes("ff");
    const maxSlots    = tournament.maxSlots || (isFreeFire ? 50 : 100);
    const displayMode = tournament.mode || (isFreeFire ? "Clash Squad / BR" : "Squad / Solo");
    const joinedCount = tournament.joined_players_count || 0;
    const isFull      = joinedCount >= maxSlots;

    useEffect(() => {
      if (!tournament.slides?.length) return;
      const t = setInterval(() => setCurrentSlide((p) => (p + 1) % tournament.slides.length), 3500);
      return () => clearInterval(t);
    }, [tournament.slides?.length]);

    const handleCardJoinClick = () => {
      setActiveMatch(tournament);
      setHasAgreedRules(false);
      setIsRulesModalOpen(true);
    };

    return (
      <div className="bg-black/60 border border-gray-800 hover:border-gray-700 transition-all rounded-lg overflow-hidden flex flex-col shadow-xl">
        <div className="relative h-44 w-full bg-black overflow-hidden">
          {tournament.slides?.[currentSlide] && (
            <img
              src={tournament.slides[currentSlide]}
              alt={tournament.title}
              className="w-full h-full object-cover filter saturate-125 transition-all duration-700"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f17] via-transparent to-black/40" />
          <div className="absolute top-2 left-2">
            <span className={`text-[10px] font-mono px-2 py-0.5 border uppercase font-bold ${isFreeFire ? "bg-orange-950 text-orange-400 border-orange-800" : "bg-black/85 text-cyan-400 border-cyan-800"}`}>
              {isFreeFire ? "🔥 FREE FIRE" : "🛡️ BGMI"}
            </span>
          </div>
          <div className="absolute top-2 right-2">
            <span className="text-xs font-bold px-3 py-1.5 bg-black/90 border border-yellow-500/50 text-yellow-400 rounded-md shadow-lg backdrop-blur-sm">
              Slots: {tournament.joinedCount || 0} / {maxSlots}
            </span>
          </div>
          <div className="absolute bottom-2 left-3 right-3">
            <h3 className="font-black tracking-wide uppercase text-sm sm:text-base text-white">{tournament.title}</h3>
            <p className="text-[11px] text-gray-300 font-mono">Map: <span className="text-cyan-300 font-bold">{tournament.map}</span></p>
            <div className="mt-1.5">
  <MatchCountdown matchTime={tournament.date} />
</div>
          </div>
        </div>
        <div className="p-4 bg-[#0f141c]/90 flex items-center justify-between border-t border-gray-900">
          <div>
            <span className="text-[10px] text-gray-400 font-mono uppercase block">MODE</span>
            <span className="text-xs font-mono font-bold text-yellow-400">{displayMode}</span>
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-mono uppercase block">ENTRY FEE</span>
            <span className="text-xs font-mono font-bold text-green-400">₹{tournament.entryFee}</span>
          </div>
          <button
            onClick={handleCardJoinClick}
            disabled={isFull}
            className={`px-5 py-2.5 font-black text-xs uppercase tracking-wider transition-all shadow-lg ${
              isFull
                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                : isFreeFire
                  ? "bg-orange-500 text-black hover:bg-orange-400 cursor-pointer"
                  : "bg-cyan-400 text-black hover:bg-cyan-300 cursor-pointer"
            }`}
          >
            {isFull ? "Slots Full" : "Join"}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f17] flex items-center justify-center text-cyan-400 font-mono text-sm animate-pulse">
        LOADING BATTLE CROWN DASHBOARD...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0f17]/90 text-white p-6 relative overflow-hidden font-mono">
      {/* Background */}
      <div className="absolute inset-0 z-0 opacity-40 transition-all duration-1000">
        <div className="w-full h-full bg-cover bg-center filter saturate-125" style={{ backgroundImage: `url(${bgMedia[currentBgIndex].url})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f17] via-[#0b0f17]/50 to-transparent" />
      </div>

      {/* Level-Up Crown Toast */}
      {levelUpCrownMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-yellow-950 border border-yellow-500 text-yellow-300 text-xs font-bold px-5 py-3 rounded-lg shadow-2xl animate-bounce text-center max-w-xs">
          {levelUpCrownMsg}
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center border-b border-gray-800 pb-4 mb-8 relative z-50">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black tracking-tighter italic">BATTLE <span className="text-cyan-400">CROWN</span></span>
          <span className="text-[10px] bg-red-600 text-white font-bold px-1.5 py-0.5 uppercase">DUAL-GAME ESPORTS</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsAboutModalOpen(true)} title="About App" className="w-9 h-9 bg-[#161d2b] border border-cyan-500/40 text-cyan-400 rounded-lg flex items-center justify-center cursor-pointer hover:bg-cyan-950/50">ℹ️</button>
          <button onClick={() => setIsSupportModalOpen(true)} title="Support" className="w-9 h-9 bg-[#161d2b] border border-yellow-500/40 text-yellow-400 rounded-lg flex items-center justify-center cursor-pointer hover:bg-yellow-950/50">🎧</button>
          <button onClick={() => setIsLevelModalOpen(true)} title="Level & Badges" className="px-3 h-9 bg-gradient-to-r from-yellow-950 to-black border border-yellow-500/60 text-yellow-400 rounded-lg flex items-center gap-1.5 text-xs font-bold cursor-pointer hover:border-yellow-400">
            <span>🛡️ Lvl {playerLevel}</span>
            <span className="text-[10px] bg-cyan-950 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-800">Prot: {protectionPoints}</span>
          </button>
          <div className="text-right hidden sm:block ml-2">
            <p className="text-sm font-bold font-mono text-cyan-400">{bgmiIgn} | {ffIgn}</p>
            <p className="text-xs text-gray-400 font-mono"><span className="text-yellow-400 font-bold">{currentTier.name} {currentTier.badge}</span></p>
          </div>
          <NotificationBell />
          <button onClick={handleLogout} className="px-4 py-2 bg-transparent border border-gray-700 text-xs uppercase font-bold hover:border-red-600 hover:text-red-600 cursor-pointer">
            Logout
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10 items-stretch mb-6">

        {/* Left: Player Profile */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#0f141c]/95 border border-gray-800 p-6 relative shadow-xl h-full flex flex-col justify-between">
            <div className="absolute top-0 left-0 w-1.5 h-16 bg-cyan-400" />
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-mono uppercase tracking-widest font-bold text-gray-400">// PLAYER PROFILE</h2>
              <button onClick={() => setIsEditingProfile(!isEditingProfile)} className="text-[10px] text-cyan-400 uppercase font-bold cursor-pointer bg-cyan-950/60 px-2 py-1 border border-cyan-800">
                {isEditingProfile ? "Save All ✓" : "Edit Profiles ✍️"}
              </button>
            </div>

            <div className="space-y-4">
              {/* Rank & Tier */}
              <div onClick={() => setIsLevelModalOpen(true)} className="bg-gradient-to-r from-yellow-950/40 to-black/60 p-3 rounded border border-yellow-800/50 flex justify-between items-center cursor-pointer hover:border-yellow-500">
                <div>
                  <span className="text-[10px] text-yellow-500 uppercase block font-bold">CURRENT RANK & TIER</span>
                  <span className="text-xs font-bold text-white">{currentTier.name} {currentTier.badge}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-cyan-400 uppercase block font-bold">LEVEL</span>
                  <span className="text-sm font-black text-cyan-300">Lvl {playerLevel}</span>
                </div>
              </div>

              {/* BGMI Profile */}
              <div className="bg-black/40 p-3 rounded border border-gray-900 space-y-2">
                <span className="text-[11px] font-bold text-cyan-400">🛡️ BGMI PROFILE</span>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">IGN:</span>
                  {isEditingProfile ? <input type="text" value={tempBgmiIgn} onChange={(e) => setTempBgmiIgn(e.target.value)} className="bg-black border border-cyan-600 px-2 py-0.5 text-xs text-white w-28" /> : <span className="font-bold text-white">{bgmiIgn}</span>}
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">UID:</span>
                  {isEditingProfile ? <input type="text" value={tempBgmiUid} onChange={(e) => setTempBgmiUid(e.target.value)} className="bg-black border border-cyan-600 px-2 py-0.5 text-xs text-cyan-300 w-28" /> : <span className="font-bold text-cyan-300">{bgmiUid}</span>}
                </div>
              </div>

              {/* Free Fire Profile */}
              <div className="bg-black/40 p-3 rounded border border-gray-900 space-y-2">
                <span className="text-[11px] font-bold text-orange-400">🔥 FREE FIRE PROFILE</span>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">IGN:</span>
                  {isEditingProfile ? <input type="text" value={tempFfIgn} onChange={(e) => setTempFfIgn(e.target.value)} className="bg-black border border-orange-600 px-2 py-0.5 text-xs text-white w-28" /> : <span className="font-bold text-white">{ffIgn}</span>}
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">UID:</span>
                  {isEditingProfile ? <input type="text" value={tempFfUid} onChange={(e) => setTempFfUid(e.target.value)} className="bg-black border border-orange-600 px-2 py-0.5 text-xs text-orange-300 w-28" /> : <span className="font-bold text-orange-300">{ffUid}</span>}
                </div>
              </div>

              {/* Unlocked Badges */}
              <div className="bg-gradient-to-r from-yellow-950/20 via-black to-yellow-950/20 p-3 rounded border border-yellow-800/40 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-yellow-400 uppercase tracking-wider">🏆 UNLOCKED BADGES</span>
                  <span className="text-[10px] text-gray-400 font-mono">{getUnlockedBadges().length} / {levelBadgesMap.length} Earned</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {getUnlockedBadges().map((b) => (
                    <div key={b.level} title={`Unlocked at Level ${b.level}: ${b.name}`} className="bg-black/80 border border-yellow-600/60 px-2 py-1 rounded flex items-center gap-1.5 text-xs shadow cursor-pointer hover:border-yellow-400">
                      <span>{b.badge}</span>
                      <span className="text-[11px] font-bold text-white">{b.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {isEditingProfile && (
                <button onClick={async () => {
  setBgmiIgn(tempBgmiIgn); setBgmiUid(tempBgmiUid); setFfIgn(tempFfIgn); setFfUid(tempFfUid); setIsEditingProfile(false);
  try {
    await fetch("/api/user/update-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail, bgmiIgn: tempBgmiIgn, bgmiUid: tempBgmiUid, ffIgn: tempFfIgn, ffUid: tempFfUid }),
    });
  } catch (err) { console.error("Profile save error:", err); }
}} className="w-full py-2 bg-cyan-400 text-black font-bold text-xs uppercase cursor-pointer">
  Confirm Profile Updates
</button>
              )}

              {/* Bio */}
              <div className="pt-2 border-t border-gray-800">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-gray-400 uppercase">Social Bio (Max 100 Words)</span>
                 <button
  onClick={async () => {
    if (!isEditingBio) {
      setTempBio(bio || "");
      setIsEditingBio(true);
      return;
    }

    const wordCount = tempBio.trim().split(/\s+/).filter(Boolean).length;

    if (wordCount > 100) {
      setBioError("Bio cannot exceed 100 words.");
      return;
    }

    setBioError(null);

    try {
      const response = await fetch("/api/user/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          bio: tempBio,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save bio");
      }

      setBio(tempBio);
      setIsEditingBio(false);
    } catch (err) {
      console.error("Bio save error:", err);
      setBioError("Failed to save bio. Please try again.");
    }
  }}
  className="text-[10px] text-cyan-400 font-bold cursor-pointer"
>
  {isEditingBio ? "Save Bio ✓" : "Edit Bio"}
</button>
                </div>
                {isEditingBio ? (
                  <>
                    <textarea value={tempBio} onChange={(e) => {
                      const words = e.target.value.trim().split(/\s+/).filter(Boolean);
                      if (words.length <= 100) { setTempBio(e.target.value); setBioError(null); }
                      else setBioError("Maximum 100 words allowed.");
                    }} className="w-full bg-black border border-cyan-600 p-2 text-xs text-white h-16" />
                    {bioError && <p className="text-[10px] text-red-500 font-bold mt-1">{bioError}</p>}
                  </>
                ) : (
                  <p className="text-xs text-gray-300 italic bg-black/30 p-2 border border-gray-900">"{bio}"</p>
                )}
              </div>

              {/* XP Progress & Protection Points */}
              <div className="bg-black/50 p-3 rounded border border-gray-900 space-y-2 pt-3 border-t border-gray-800">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Match XP Progress:</span>
                  <span className="text-cyan-300 font-bold">
                    {playerLevel >= MAX_LEVEL ? "Max Level Reached" : `${matchesTowardNext} / ${matchesNeededForNext} Matches`}
                  </span>
                </div>
                <div className="w-full bg-gray-900 h-2 rounded overflow-hidden border border-gray-800">
                  <div className="bg-gradient-to-r from-yellow-500 to-amber-500 h-full transition-all duration-300" style={{ width: `${playerLevel >= MAX_LEVEL ? 100 : Math.min((matchesTowardNext / matchesNeededForNext) * 100, 100)}%` }} />
                </div>
                <div className="flex justify-between items-center pt-1 text-[11px]">
                  <span className="text-cyan-400">🛡️ Protection Points:</span>
                  <span className="font-bold text-yellow-400">{protectionPoints} Points</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleXpInfoClick} className="flex-1 py-1.5 bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] uppercase font-bold cursor-pointer hover:bg-cyan-950/80 transition-all">
                    ℹ️ How XP Works
                  </button>
                  <button onClick={handleInactivityInfoClick} className="flex-1 py-1.5 bg-rose-950 text-rose-300 border border-rose-800 text-[10px] uppercase font-bold cursor-pointer hover:bg-rose-950/80 transition-all">
                    🛡️ Protection Info
                  </button>
                </div>

                {xpModalMessage && (
                  <div className="text-[10px] text-cyan-300 bg-cyan-950/40 p-2 border border-cyan-800/60 mt-2 italic rounded">
                    {xpModalMessage}
                  </div>
                )}
                {inactivityModalMessage && (
                  <div className="text-[10px] text-yellow-300 bg-yellow-950/40 p-2 border border-yellow-800/60 mt-2 italic rounded">
                    {inactivityModalMessage}
                  </div>
                )}
              </div>

              {/* Crown Reward Table Preview */}
              <div className="bg-black/40 p-3 rounded border border-yellow-900/50 space-y-2">
                <span className="text-[11px] font-bold text-yellow-400 uppercase">👑 Crown Reward Table</span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono max-h-28 overflow-y-auto pr-1">
                  {CROWN_REWARD_TABLE.map((r) => (
                    <div key={r.level} className={`flex justify-between items-center px-2 py-0.5 rounded ${playerLevel >= r.level ? "bg-yellow-950/40 text-yellow-300" : "text-gray-500"}`}>
                      <span>Lv {r.level}:</span>
                      <span className={`font-bold ${r.bumper ? "text-orange-400" : ""}`}>
                        +{r.crowns} 👑{r.bumper ? " 🎉" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Right: Gaming Wallet */}
        <div className="lg:col-span-2 flex flex-col space-y-4 h-full justify-between">
          <div className="flex-1 flex flex-col">
            <GamingWallet
              depositWallet={depositWallet}
              setDepositWallet={setDepositWallet}
              winningsWallet={winningsWallet}
              setWinningsWallet={setWinningsWallet}
              crowns={crowns}
              setCrowns={setCrowns}
              userEmail={userEmail}
            />
         </div>
          <p className="text-[11px] text-yellow-400 font-mono italic bg-yellow-950/40 p-1.5 border border-yellow-800/60 text-center">
            💡 Redeem 20 Crowns for a complimentary ₹10 match ticket!
          </p>
          <p className="text-[11px] text-cyan-300 font-mono italic bg-cyan-950/40 p-1.5 border border-cyan-800/60 text-center">
            ⭐ Earn 1 crown for every tournament match entry completed!
          </p>
          {redeemMessage && <p className="text-[11px] text-cyan-300 text-center font-bold italic">{redeemMessage}</p>}
        </div>
      </div>

      {/* Active Tournaments */}
      <div className="bg-[#0f141c]/95 border border-gray-800 p-6 relative shadow-xl mb-6 relative z-10">
        <div className="absolute top-0 left-0 w-1.5 h-16 bg-red-600" />
        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
          <h2 className="text-sm font-mono uppercase tracking-widest font-bold text-gray-400">// ACTIVE TOURNAMENTS</h2>
          <div className="flex bg-black/80 p-1 border border-gray-800 rounded">
            <button onClick={() => { setSelectedGameTab("bgmi"); setCurrentPage(1); }} className={`px-4 py-1.5 text-xs font-mono uppercase font-bold cursor-pointer ${selectedGameTab === "bgmi" ? "bg-cyan-400 text-black" : "text-gray-400"}`}>🛡️ BGMI</button>
            <button onClick={() => { setSelectedGameTab("ff"); setCurrentPage(1); }} className={`px-4 py-1.5 text-xs font-mono uppercase font-bold cursor-pointer ${selectedGameTab === "ff" ? "bg-orange-500 text-black" : "text-gray-400"}`}>🔥 Free Fire</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {displayedTournaments.map((match) => (
            <TournamentCard key={match.id} tournament={match} />
          ))}
        </div>
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-800">
          <button onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-4 py-2 bg-black border border-gray-700 text-xs font-bold disabled:opacity-40 cursor-pointer">◀ Prev</button>
          <span className="text-xs text-gray-400 font-mono">Page {currentPage} of {totalPages || 1}</span>
          <button onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 0} className="px-4 py-2 bg-black border border-gray-700 text-xs font-bold disabled:opacity-40 cursor-pointer">Next ▶</button>
        </div>
      </div>

      {/* Recent Match History */}
      <div className="bg-[#0f141c]/95 border border-gray-800 p-6 relative shadow-xl space-y-4 rounded-xl relative z-10">
        <h2 className="text-sm font-mono uppercase tracking-widest font-bold text-gray-400 mb-3">// RECENT MATCH HISTORY (LATEST 5)</h2>
        {shareMessage && <p className="text-[10px] text-cyan-300 mb-2 italic">{shareMessage}</p>}
        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
          {matchHistory.length === 0 ? (
            <p className="text-xs text-gray-500 italic text-center py-4">No matches played yet.</p>
          ) : (
            matchHistory.map((match) => (
              <div key={match.id} className="bg-[#0f141c] border border-gray-800 p-4 rounded-lg space-y-3 text-xs font-mono">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-cyan-400 uppercase font-bold">{match.gameType}</span>
                      <span className="bg-cyan-950 text-cyan-300 border border-cyan-700/60 px-1.5 py-0.5 rounded text-[10px] font-bold">Lvl {match.playerLevel || 1}</span>
                    </div>
                    <h4 className="text-sm font-bold text-white mt-1">{match.tournamentName}</h4>
                    <p className="text-gray-400">Map: {match.mapName}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-red-400 font-bold block text-[11px]">Paid: {match.entryPaid}</span>
                    <span className="text-[10px] text-gray-400 block">{getTimeAgo(match.joinTime)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2 border-t border-gray-800/60">
                  <div className="flex items-center gap-2">
                    {match.screenshotUrl ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-green-400 font-bold">✅ Proof Submitted:</span>
                        <img src={match.screenshotUrl} alt="Match Proof" className="w-16 h-10 object-cover rounded border border-cyan-500/30" />
                      </div>
                    ) : (
                      <>
                        <input type="file" accept="image/*" id={`file-${match.id}`} onChange={(e) => setMatchScreenshot(e.target.files[0])} className="hidden" />
                        <label htmlFor={`file-${match.id}`} className="bg-zinc-800 hover:bg-zinc-700 text-cyan-400 border border-cyan-500/30 font-bold text-[10px] px-2.5 py-1 rounded cursor-pointer transition-all">
                          {matchScreenshot ? "File Selected ✓" : "Choose Screenshot"}
                        </label>
                        <span className="text-[10px] text-gray-400 italic">*Upload your victory screenshot as proof</span>
                      </>
                    )}
                  </div>
                  {!match.screenshotUrl && (
                    <button onClick={() => handleUploadScreenshot(match.tournamentName, match.dbMatchId)} disabled={uploadingSS} className="bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold text-[10px] px-3 py-1 rounded cursor-pointer transition-all uppercase tracking-wider">
                      {uploadingSS ? "Uploading..." : "Submit Proof"}
                    </button>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-gray-800/60 mt-2">
                  <span className="text-[10px] text-green-400 font-bold">Status: Joined Successfully</span>
                  <button onClick={() => handleShareMatch(match)} className="px-2.5 py-1 bg-[#161d2b] hover:bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] uppercase font-bold cursor-pointer flex items-center gap-1 transition">
                    🔗 Share Match
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modals */}

      {/* Level & Badges Modal */}
      {isLevelModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f141c] border border-yellow-500 p-6 max-w-md w-full space-y-4">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <h3 className="text-sm font-bold text-yellow-400 uppercase">// LEVEL & BADGES PROGRESSION</h3>
              <button onClick={() => setIsLevelModalOpen(false)} className="text-gray-400 hover:text-white text-xs cursor-pointer">✕</button>
            </div>
            <div className="bg-yellow-950/30 p-2.5 border border-yellow-800/50 text-xs flex justify-between items-center">
              <span>Current Level: <strong className="text-cyan-300">Lvl {playerLevel}</strong></span>
              <span className="text-yellow-400 font-bold">Protection Points: {protectionPoints} 🛡️</span>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {levelBadgesMap.map((tier) => {
                const crownReward = getCrownRewardForLevel(tier.level);
                const isBumper   = CROWN_REWARD_TABLE.find((r) => r.level === tier.level)?.bumper;
                return (
                  <div key={tier.level} className={`p-2.5 rounded border text-xs ${playerLevel >= tier.level ? "bg-yellow-950/30 border-yellow-700/60 text-white" : "bg-black/40 border-gray-800 text-gray-500"}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-bold block text-yellow-400">Level {tier.level}: {tier.name} {tier.badge}</span>
                        <span className="text-[10px] text-gray-400">Lifetime matches to reach: {getTotalMatchesForLevel(tier.level)}</span>
                      </div>
                      <div className="text-right space-y-1">
                        {playerLevel >= tier.level ? (
                          <span className="text-[10px] bg-green-950 text-green-400 border border-green-800 px-2 py-0.5 font-bold block">UNLOCKED ✓</span>
                        ) : (
                          <span className="text-[10px] text-gray-500 font-mono block">LOCKED</span>
                        )}
                        {crownReward > 0 && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded block ${isBumper ? "bg-orange-950 text-orange-400 border border-orange-800" : "bg-yellow-950 text-yellow-400 border border-yellow-800"}`}>
                            +{crownReward} 👑{isBumper ? " BUMPER" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setIsLevelModalOpen(false)} className="px-4 py-2 bg-yellow-500 text-black font-bold text-xs uppercase cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}

     {/* Step 1: Rules */}
{isRulesModalOpen && activeMatch && (
  <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-[#0f141c] border border-cyan-500 p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
      <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wide flex-shrink-0">
        🛡️ BATTLE CROWN — OFFICIAL RULES & REGULATIONS
      </h3>

      <div className="bg-black/60 p-4 border border-gray-800 text-xs space-y-4 text-gray-300 leading-relaxed overflow-y-auto pr-2">

        <div>
          <p className="font-bold text-yellow-400 mb-1">1. Eligibility</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Participants must have a valid Battle Crown account.</li>
            <li>Only one account per player is allowed. Multiple accounts are strictly prohibited.</li>
            <li>Players must provide a valid Game UID and IGN. Incorrect details may lead to disqualification.</li>
          </ul>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">2. Tournament Entry</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Entry fees are non-refundable once the tournament starts.</li>
            <li>Joining a tournament confirms acceptance of all Battle Crown rules.</li>
            <li>Entry is confirmed only after successful payment and cannot be transferred to another player.</li>
          </ul>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">3. Room Details</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Room ID & Password will be shown approximately 10 minutes before match start.</li>
            <li>Players are responsible for joining on time.</li>
            <li>Battle Crown is not responsible for internet or device issues.</li>
          </ul>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">4. Match Start Rules</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Players must join before the scheduled time. Late players may lose their slot.</li>
            <li>Matches will start according to schedule — no rematch for late joining.</li>
          </ul>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">5. Fair Play Policy</p>
          <p className="text-gray-400 mb-1">The following are strictly prohibited:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400 grid grid-cols-2 gap-x-2">
            <li>Hacks / Cheats</li>
            <li>Mod APKs</li>
            <li>ESP</li>
            <li>Aim Assist</li>
            <li>Wall Hack</li>
            <li>Speed Hack</li>
            <li>Third-party software</li>
            <li>Unauthorized emulator usage in (mobile-only tournaments)</li>
            <li>Teaming (Solo matches)</li>
            <li>Account sharing</li>
            <li>Intentional feeding</li>
            <li>Match fixing</li>
            <li>Exploiting game bugs</li>
          </ul>
          <p className="text-red-400 font-bold mt-1">Violation results in immediate disqualification.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">6. Result Submission</p>
          <p className="text-gray-400 mb-1">Players must upload:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Match Screenshot</li>
            <li>Correct Kill Count</li>
            <li>Rank</li>
          </ul>
          <p className="text-gray-400 mt-1">False submissions may result in permanent suspension.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">7. Prize Distribution</p>
          <p className="text-gray-400 mb-1">Prize calculation includes:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Placement Prize</li>
            <li>Kill Rewards (if applicable)</li>
          </ul>
          <p className="text-gray-400 mt-1">Rewards are credited only after admin verification.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">8. Verification Process</p>
          <p className="text-gray-400 mb-1">Battle Crown reserves the right to:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Review screenshots</li>
            <li>Request additional proof</li>
            <li>Delay prize distribution if verification is pending</li>
            <li>Reject suspicious results</li>
          </ul>
          <p className="text-gray-400 mt-1">Admin decisions are final.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">9. Wallet Rules</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Prize money is credited to the Winnings Wallet.</li>
            <li>Deposit Wallet cannot be used for withdrawals.</li>
            <li>Withdrawals are processed after successful verification.</li>
            <li>Battle Crown may require KYC verification before processing withdrawals as per applicable requirements.</li>
          </ul>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">10. Refund Policy</p>
          <p className="text-gray-400 mb-1">Refunds are provided only if:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Tournament is cancelled by Battle Crown.</li>
            <li>Server failure prevents match start.</li>
            <li>Failed or incomplete payments will be handled according to payment gateway status verification.</li>
          </ul>
          <p className="text-gray-400 mt-1">No refunds for: late joining, wrong UID, internet issues, device problems, or player absence.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">11. Disqualification</p>
          <p className="text-gray-400 mb-1">Players may be disqualified for:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Fake screenshots, kills, or ranks</li>
            <li>Toxic behaviour or abusive language</li>
            <li>Impersonation</li>
            <li>Rule violations or cheating</li>
          </ul>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">12. Account Suspension</p>
          <p className="text-gray-400 mb-1">Battle Crown may temporarily or permanently suspend accounts for:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Fraud or payment abuse</li>
            <li>Multiple accounts</li>
            <li>Exploits or security violations</li>
          </ul>
          <p className="text-gray-400 mt-1">Suspended accounts lose tournament eligibility.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">13. Tournament Cancellation</p>
          <p className="text-gray-400 mb-1">Battle Crown may cancel tournaments because of:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Server maintenance or technical issues</li>
            <li>Low participation</li>
            <li>Emergency situations</li>
          </ul>
          <p className="text-gray-400 mt-1">Refund policy applies where applicable.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">14. Network Responsibility</p>
          <p className="text-gray-400">Battle Crown is not responsible for: internet disconnection, device overheating, power failure, game crashes, ping issues, or FPS drops.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">15. Content Policy</p>
          <p className="text-gray-400 mb-1">Players must not upload:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>Edited screenshots or fake proof</li>
            <li>Offensive or illegal content</li>
          </ul>
          <p className="text-gray-400 mt-1">Such content results in immediate account action.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">16. Privacy</p>
          <p className="text-gray-400 mb-1">Battle Crown stores: Email, Game UID, IGN, Match History, and Wallet History.</p>
          <p className="text-gray-400">Data is used only for tournament operations.</p>
          <li>Battle Crown does not sell user personal information to third parties.</li>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">17. Limitation of Liability</p>
          <p className="text-gray-400">Battle Crown is not responsible for game server outages, publisher issues, device failures, internet failures, or force majeure events.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">18. Changes to Rules</p>
          <p className="text-gray-400">Battle Crown may update these rules without prior notice. Continued use of the platform means acceptance of updated rules.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">19. Final Decision</p>
          <p className="text-gray-400">All tournament-related decisions made by Battle Crown Admins are final and binding. Admin decisions are based on available evidence and verification results. Players may contact support for clarification regarding decisions.</p>
        </div>

        <div>
          <p className="font-bold text-yellow-400 mb-1">20. Acceptance</p>
          <p className="text-gray-400">By joining any Battle Crown tournament, you acknowledge that you have read, understood, and agreed to these Rules & Regulations.</p>
        </div>

        <div className="border-t border-gray-800 pt-3">
          <p className="font-bold text-orange-400 mb-1">⚠️ Important Disclaimer</p>
          <p className="text-gray-400">
            Battle Crown is an independent esports tournament platform and is not affiliated with, endorsed by, or sponsored by Krafton, PUBG/BGMI, Garena, Free Fire, Google, Apple, or any game publisher. All game names, logos, and trademarks belong to their respective owners.
          </p>
        </div>

      </div>

      <label className="flex items-center gap-2.5 text-xs text-cyan-300 cursor-pointer pt-1 bg-cyan-950/30 p-2.5 border border-cyan-800/50 flex-shrink-0">
        <input type="checkbox" checked={hasAgreedRules} onChange={(e) => setHasAgreedRules(e.target.checked)} className="accent-cyan-400 w-4 h-4 cursor-pointer" />
        <span className="font-bold">I agree to Battle Crown Rules & Regulations and Terms of Service.</span>
      </label>

      <div className="flex justify-end gap-2 pt-3 border-t border-gray-800 flex-shrink-0">
        <button onClick={() => { setIsRulesModalOpen(false); setActiveMatch(null); }} className="px-4 py-2 bg-gray-800 text-xs uppercase font-bold cursor-pointer">Back</button>
        <button onClick={() => {
          if (!hasAgreedRules) { alert("You must agree to the rules to proceed."); return; }
          setIsRulesModalOpen(false); setIsDetailsModalOpen(true);
        }} className="px-5 py-2 bg-cyan-400 text-black font-black text-xs uppercase cursor-pointer hover:bg-cyan-300">Proceed ➤</button>
      </div>
    </div>
  </div>
)}

      {/* Step 2: Prize Pool Details */}
      {isDetailsModalOpen && activeMatch && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f141c] border border-cyan-500 p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wide">// TOURNAMENT DETAILS & PRIZE POOL</h3>
              <button onClick={() => setIsDetailsModalOpen(false)} className="text-gray-400 hover:text-white text-xs cursor-pointer">✕</button>
            </div>
            <div className="bg-black/60 p-4 border border-gray-800 space-y-3 text-xs">
              <div className="flex justify-between border-b border-gray-800/60 pb-2">
                <span className="text-gray-400">Tournament:</span>
                <span className="font-bold text-cyan-300">{activeMatch.title}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800/60 pb-2">
                <span className="text-gray-400">Timing & Date:</span>
                <span className="font-bold text-yellow-400">{activeMatch.date}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800/60 pb-2">
                <span className="text-gray-400">Map & Mode:</span>
                <span className="font-bold text-white">{activeMatch.map} ({activeMatch.mode})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Entry Fee:</span>
                <span className="font-bold text-green-400">₹{activeMatch.entryFee}</span>
              </div>
            </div>
            <div className="bg-cyan-950/30 p-3.5 border border-cyan-800/60 rounded space-y-2">
              <h4 className="text-yellow-400 font-bold uppercase text-xs text-center">🏆 PRIZE POOL DISTRIBUTION (%) 🏆</h4>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex justify-between bg-black/40 p-1.5 border border-gray-800"><span className="text-yellow-400 font-bold">🥇 1st Place:</span><span className="text-cyan-300">20% of pool</span></div>
                <div className="flex justify-between bg-black/40 p-1.5 border border-gray-800"><span className="text-gray-300 font-bold">🥈 2nd Place:</span><span className="text-cyan-300">10% of pool</span></div>
                 <div className="flex justify-between bg-black/40 p-1.5 border border-gray-800"><span className="text-gray-300 font-bold">🥉 3rd Place:</span><span className="text-cyan-300">5% of pool</span></div>
                <div className="flex justify-between bg-black/40 p-1.5 border border-gray-800"><span className="text-red-400 font-bold">🎯 Per Kill Bounty:</span><span className="text-cyan-300">₹5/kill • Higher entry = Higher kill reward</span></div>
              </div>
              <div className="mt-3 bg-yellow-950/20 border border-yellow-700/40 p-3 rounded text-center">
  <p className="text-yellow-400 font-bold text-xs uppercase tracking-wider">
    ⚔️ GOOD LUCK, WARRIOR! ⚔️
  </p>
  <p className="text-gray-300 text-[11px] font-mono mt-1">
    Enter the battlefield, trust your skills & fight till the final zone.
    Play fair. Stay focused. Claim your Crown! 👑🔥
  </p>
</div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setIsDetailsModalOpen(false)} className="px-4 py-2 bg-gray-800 text-xs uppercase cursor-pointer">Cancel</button>
              <button onClick={() => { setIsDetailsModalOpen(false); setIsDetailsFormModalOpen(true); }} className="px-5 py-2 bg-cyan-400 text-black font-black text-xs uppercase cursor-pointer hover:bg-cyan-300">Join Now ➤</button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Player Details Form */}
      {isDetailsFormModalOpen && activeMatch && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f141c] border border-cyan-500 p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wide">// ENTER PLAYER DETAILS</h3>
            <div className="space-y-3 text-xs">
              {[
                { label: "WhatsApp Number *", type: "text", placeholder: "e.g., 9876543210", value: playerWhatsapp, onChange: setPlayerWhatsapp },
                { label: "Email Address *",    type: "email",  placeholder: "",                value: playerEmailInput, onChange: setPlayerEmailInput },
                { label: "In-Game Name (IGN) *", type: "text", placeholder: "e.g., AlphaShadow", value: playerIgnInput, onChange: setPlayerIgnInput },
                { label: "In-Game UID *",      type: "text",  placeholder: "e.g., 5123456789", value: playerUidInput, onChange: setPlayerUidInput },
              ].map(({ label, type, placeholder, value, onChange }) => (
                <div key={label}>
                  <label className="text-[10px] text-gray-400 uppercase block mb-1">{label}</label>
                  <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-black border border-gray-700 p-2 text-white text-xs" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
              <button onClick={() => setIsDetailsFormModalOpen(false)} className="px-4 py-2 bg-gray-800 text-xs uppercase cursor-pointer">Cancel</button>
              <button onClick={() => {
                if (!playerWhatsapp || !playerEmailInput || !playerIgnInput || !playerUidInput) { alert("Please fill in all required details."); return; }
                setIsDetailsFormModalOpen(false); setIsConfirmModalOpen(true);
              }} className="px-5 py-2 bg-cyan-400 text-black font-black text-xs uppercase cursor-pointer hover:bg-cyan-300">Confirm Details ➤</button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Final Confirmation */}
      {isConfirmModalOpen && activeMatch && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f141c] border border-green-500 p-6 max-w-md w-full space-y-4 shadow-2xl text-center">
            <h3 className="text-sm font-bold text-green-400 uppercase tracking-wide">// FINAL CONFIRMATION</h3>
            <div className="bg-green-950/30 p-3.5 border border-green-800/50 text-xs text-gray-300 space-y-2 text-left">
              <p>Tournament: <strong className="text-white">{activeMatch.title}</strong></p>
              <p>Entry Fee: <strong className="text-green-400">₹{activeMatch.entryFee}</strong></p>
              <p>IGN & UID: <strong className="text-yellow-400">{playerIgnInput} ({playerUidInput})</strong></p>
            </div>
            <div className="flex justify-between items-center gap-3 pt-3 border-t border-gray-800">
              <button onClick={() => setIsConfirmModalOpen(false)} className="px-5 py-2 border border-red-500 text-red-500 font-black text-xs uppercase cursor-pointer hover:bg-red-950">Cancel</button>
              <button
                disabled={isSubmitting}
                onClick={async () => {
                  if (isSubmitting) return;
                  if (depositWallet < activeMatch.entryFee) {
                    alert("Insufficient deposit balance. Please add money to continue.");
                    setIsConfirmModalOpen(false); return;
                  }
                  setIsSubmitting(true);
                  try {
                    const formData = new FormData();
                    formData.append("email", userEmail);
                    formData.append("tournamentId", activeMatch.id);
                    formData.append("game", activeMatch.game);
                    formData.append("entryFee", activeMatch.entryFee);
                    formData.append("tournamentName", activeMatch.title);
                    formData.append("mapName", activeMatch.map);
                    formData.append("ign", playerIgnInput);
                    formData.append("uid", playerUidInput);
                    formData.append("whatsapp_number", playerWhatsapp);
                    formData.append("gameType", selectedGameTab === "bgmi" ? "BGMI" : "FREE FIRE");

                    const res  = await fetch("/api/tournament/join", { method: "POST", body: formData });
                    const data = await res.json();

                    if (data.success) {
                      if (data.depositWallet !== undefined) setDepositWallet(data.depositWallet);
                      if (data.crowns !== undefined) setCrowns(data.crowns);
                      else setCrowns((p) => p + 1);

                      if (data.matchesPlayed !== undefined) {
                        setMatchesPlayed(data.matchesPlayed);
                      } else {
                        setMatchesPlayed((p) => p + 1);
                      }

                      addMatchHistoryRecord(activeMatch.title, activeMatch.map, selectedGameTab === "bgmi" ? "BGMI" : "FREE FIRE", `₹${activeMatch.entryFee}`, data.matchHistoryId);
                      alert(`Successfully joined ${activeMatch.title}!`);
                      setIsConfirmModalOpen(false);
                    } else {
                      alert(`Error: ${data.message || "Could not join tournament"}`);
                    }
                  } catch {
                    alert("Server connection error during registration.");
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="px-5 py-2 bg-green-500 text-black font-black text-xs uppercase cursor-pointer hover:bg-green-400 disabled:opacity-60"
              >
                {isSubmitting ? "PROCESSING..." : "CONFIRM & PROCEED ➤"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPI Add Money Modal */}
      {isUpiModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f141c] border border-cyan-500 p-6 max-w-sm w-full space-y-4 text-center">
            <h3 className="text-sm font-bold text-cyan-400 uppercase">// ADD MONEY (UPI)</h3>
            <div className="bg-white p-4 rounded-lg inline-block mx-auto border-2 border-cyan-400">
              <div className="w-40 h-40 bg-gray-200 flex flex-col items-center justify-center text-black text-xs font-bold border border-dashed border-gray-400">
                <span>[ SCAN QR TO PAY ]</span>
                <span className="text-[10px] text-cyan-700 mt-1">9034388712@fam</span>
              </div>
            </div>
            <div className="bg-black/60 p-2 border border-gray-800 text-xs">
              <span className="text-gray-400 block text-[10px]">ADMIN UPI ID:</span>
              <span className="text-cyan-400 font-bold select-all">9034388712@fam</span>
            </div>
            <div className="space-y-1 text-left">
              <label className="text-[10px] text-gray-400 uppercase">Enter Amount (₹)</label>
              <input type="number" value={addAmount} onChange={(e) => setAddAmount(Number(e.target.value))} className="w-full bg-black border border-gray-700 p-2 text-sm text-white" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setIsUpiModalOpen(false)} className="px-4 py-2 bg-gray-800 text-xs uppercase cursor-pointer">Cancel</button>
              <button onClick={() => { setDepositWallet((p) => p + addAmount); setIsUpiModalOpen(false); alert(`₹${addAmount} added successfully!`); }} className="px-4 py-2 bg-green-600 text-black font-bold text-xs uppercase cursor-pointer">I Have Paid ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f141c] border border-yellow-500 p-6 max-w-sm w-full space-y-4">
            <h3 className="text-sm font-bold text-yellow-400 uppercase">// WITHDRAW WINNINGS</h3>
            <p className="text-xs text-gray-300">Winnings: <span className="text-yellow-400 font-bold">₹{winningsWallet}</span></p>
            <div className="space-y-2">
              <label className="text-[10px] text-gray-400 uppercase">Amount (₹)</label>
              <input type="number" placeholder="Min ₹101" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="w-full bg-black border border-gray-700 p-2 text-xs text-white" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-gray-400 uppercase">Your UPI ID</label>
              <input type="text" placeholder="username@upi" value={withdrawUpiId} onChange={(e) => setWithdrawUpiId(e.target.value)} className="w-full bg-black border border-gray-700 p-2 text-xs text-white" />
            </div>
            {withdrawMessage && <p className="text-[11px] text-yellow-400 italic">{withdrawMessage}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setIsWithdrawModalOpen(false)} className="px-4 py-2 bg-gray-800 text-xs uppercase cursor-pointer">Close</button>
              <button onClick={() => {
                const amt = Number(withdrawAmount);
                if (winningsWallet < 101 || amt < 101) { setWithdrawMessage("Minimum withdrawal amount is ₹101."); return; }
                if (amt > winningsWallet) { setWithdrawMessage("Amount exceeds your available winnings balance."); return; }
                if (!withdrawUpiId.includes("@")) { setWithdrawMessage("Please enter a valid UPI ID."); return; }
                setWinningsWallet((p) => p - amt);
                setWithdrawMessage("Request submitted. Funds will be processed within 24 hours.");
                setTimeout(() => { setIsWithdrawModalOpen(false); setWithdrawMessage(null); }, 3000);
              }} className="px-4 py-2 bg-yellow-500 text-black font-bold text-xs uppercase cursor-pointer">Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* About Modal */}
      {isAboutModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f141c] border border-cyan-500 p-6 max-w-lg w-full space-y-4 max-h-[85vh] overflow-y-auto rounded-xl shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <h3 className="text-sm font-bold text-cyan-400 uppercase">// ABOUT BATTLE CROWN</h3>
              <button onClick={() => setIsAboutModalOpen(false)} className="text-gray-400 hover:text-white text-xs cursor-pointer">✕</button>
            </div>
            <div className="space-y-3 text-xs text-gray-300 leading-relaxed">
              <p><strong>Battle Crown</strong> is a competitive online gaming tournament platform for skill-based custom room matches in BGMI and Free Fire.</p>
              <div className="border-t border-gray-800 pt-3">
                <span className="text-yellow-400 font-bold uppercase block mb-1">Prize Distribution:</span>
                <ul className="list-disc pl-4 space-y-1 text-gray-400">
                  <li>🥇 1st Place: 20% of total entry fees</li>
                  <li>🥈 2nd Place: 10% of total entry fees</li>
                  <li>ª“ Per Kill Bounty: 1% per kill from total fees</li>
                </ul>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setIsAboutModalOpen(false)} className="px-5 py-2 bg-cyan-400 text-black font-black text-xs uppercase cursor-pointer rounded">Got It</button>
            </div>
          </div>
        </div>
      )}

      {/* Support Modal */}
      {isSupportModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f141c] border border-cyan-500/50 p-6 max-w-md w-full space-y-4 rounded-xl shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2 text-cyan-400">
                <Headphones className="w-5 h-5 animate-pulse" />
                <h3 className="text-sm font-bold uppercase tracking-wider">// CUSTOMER SUPPORT</h3>
              </div>
              <button onClick={() => setIsSupportModalOpen(false)} className="text-gray-400 hover:text-white text-xs cursor-pointer">✕</button>
            </div>
            <div className="bg-black/50 p-3.5 border border-gray-800/80 rounded-lg space-y-2 text-xs font-mono">
              <p className="text-gray-300">💬 <strong>WhatsApp Support:</strong> +91 9034388712</p>
              <p className="text-gray-300">✉️ <strong>Official Email:</strong> support@battlecrown.in</p>
              <p className="text-gray-300">📸 <strong>Instagram:</strong> @battle_crown_official_</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Send Message to Admin</label>
              <textarea placeholder="Describe your issue here..." value={supportQuery} onChange={(e) => setSupportQuery(e.target.value)} className="w-full bg-black/80 border border-gray-700/80 rounded-md p-2.5 text-xs text-white h-24 resize-none focus:outline-none focus:border-cyan-400" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setIsSupportModalOpen(false)} className="px-4 py-2 bg-gray-800 text-gray-300 rounded-md text-xs font-bold uppercase cursor-pointer">Cancel</button>
              <button onClick={() => {
                if (!supportQuery.trim()) { alert("Please enter your message before sending."); return; }
                alert("Support ticket submitted. Our admin team will contact you within 24 hours.");
                setSupportQuery(""); setIsSupportModalOpen(false);
              }} className="px-5 py-2 bg-cyan-500 text-black rounded-md font-black text-xs uppercase cursor-pointer flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" /> Send Query
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}