"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { Headphones, Send } from "lucide-react";

import HomeTab from "../../components/HomeTab";
import BattlesTab from "../../components/BattlesTab";
import WalletTab from "../../components/WalletTab";
import ProfileTab from "../../components/ProfileTab";
import MatchHistoryModal from "../../components/MatchHistoryModal";

// Level/XP logic lives in one shared file, imported by both this page and
// the /api/tournament/[id]/join route — this is what keeps the DB's level and
// the UI's level from ever drifting apart. Don't redefine these locally.
import { getTotalMatchesForLevel, levelBadgesMap, MAX_PLAYER_LEVEL, calculateLevelFromMatches } from "../lib/levelConfig";
import { useSearchParams } from "next/navigation";

const MAX_LEVEL = MAX_PLAYER_LEVEL;

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [firebaseUser, setFirebaseUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Small helper passed down to WalletTab/PaymentHistory so they can
  // authenticate their own fetches without duplicating Firebase logic.
  const getIdToken = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    return currentUser.getIdToken();
  };

  // ─── Payment Verify Logic ───────────────────────────────────────────────
  // After the Cashfree redirect comes back with ?order_id=..., poll our own
  // status endpoint. The webhook is the actual source of truth — this is
  // just UI feedback, so it retries a few times in case the webhook hasn't
  // landed yet.
  //
  // IMPORTANT: this must wait for firebaseUser to be set. Cashfree's
  // redirectTarget "_self" causes a full page reload, and auth.currentUser
  // is null for a brief moment while Firebase rehydrates the session — if
  // we call getIdToken() before that, it returns null and the request goes
  // out unauthenticated (401). Gating on firebaseUser fixes that.
  useEffect(() => {
    const orderId = searchParams.get("order_id");
    if (orderId && firebaseUser) {
      checkPaymentStatus(orderId);
    }
  }, [searchParams, firebaseUser]);

 async function checkPaymentStatus(orderId, attempt = 1) {
  const MAX_ATTEMPTS = 15;
  const RETRY_DELAY = 2000;

  try {
    const token = await getIdToken();

    if (!token) {
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(
          () => checkPaymentStatus(orderId, attempt + 1),
          1500
        );
      }

      return;
    }

    const res = await fetch(
      `/api/payment/status?order_id=${encodeURIComponent(orderId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const data = await res.json();

    console.log(
      `Payment status attempt ${attempt}:`,
      data
    );

    // ───────────────────────────────────────
    // PAYMENT SUCCESS
    // ───────────────────────────────────────
    if (
      res.ok &&
      data.success &&
      data.status === "PAID"
    ) {
      alert(
        "🎉 Tournament joined successfully!"
      );

      window.history.replaceState(
        {},
        document.title,
        "/dashboard"
      );

      // Refresh dashboard data
      if (firebaseUser) {
        await refreshUserProfile(
          firebaseUser.uid,
          firebaseUser.email,
          firebaseUser.displayName
        );
      }

      return;
    }

    // ───────────────────────────────────────
    // PAYMENT FAILED
    // ───────────────────────────────────────
    if (
      data.status === "FAILED" ||
      data.status === "CANCELLED"
    ) {
      alert(
        `Payment ${String(data.status).toLowerCase()}. Please try again.`
      );

      window.history.replaceState(
        {},
        document.title,
        "/dashboard"
      );

      return;
    }

    // ───────────────────────────────────────
    // STILL PROCESSING
    // ───────────────────────────────────────
    if (attempt < MAX_ATTEMPTS) {
      setTimeout(
        () => checkPaymentStatus(orderId, attempt + 1),
        RETRY_DELAY
      );

      return;
    }

    alert(
      "Payment is still being verified. Please check Match History after a few moments."
    );

    window.history.replaceState(
      {},
      document.title,
      "/dashboard"
    );

  } catch (error) {
    console.error(
      "Payment status check error:",
      error
    );

    if (attempt < MAX_ATTEMPTS) {
      setTimeout(
        () => checkPaymentStatus(orderId, attempt + 1),
        RETRY_DELAY
      );
    }
  }
}

  // ─── Bottom-nav tab switcher ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("home"); // "home" | "battles" | "wallet" | "profile"

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

    // 👇 Postgres ki tournaments table ko Firestore ke saath sync rakhta hai
    fetch("/api/tournaments/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournaments: list }),
    }).catch((err) => console.error("Tournament sync failed:", err));
  });
  return () => unsubscribe();
}, []);

  // ─── Screenshot Upload States ───────────────────────────────────────────────
  const [matchScreenshot, setMatchScreenshot] = useState(null);
  const [uploadingSS, setUploadingSS]         = useState(false);
  const [isMatchHistoryOpen, setIsMatchHistoryOpen] = useState(false);

  // ─── Player Level / XP / Protection ────────────────────────────────────────
  const [playerLevel, setPlayerLevel]             = useState(1);
  const [matchesPlayed, setMatchesPlayed]         = useState(0);
  const [protectionPoints, setProtectionPoints]   = useState(5);
  const [isLevelModalOpen, setIsLevelModalOpen]   = useState(false);

  // ─── 2D Info / XP Info Modals (realtime tooltip style) ─────────────────────
  const [inactivityModalMessage, setInactivityModalMessage] = useState(null);
  const [xpModalMessage, setXpModalMessage]             = useState(null);

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
  const [userName, setUserName]                 = useState("");

  // ─── Game Profiles ──────────────────────────────────────────────────────────
  const [bgmiIgn, setBgmiIgn]   = useState("");
  const [bgmiUid, setBgmiUid]   = useState("");
  const [ffIgn, setFfIgn]       = useState("");
  const [ffUid, setFfUid]       = useState("");
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

  // ─── FETCH USER PROFILE ─────────────────────────────────────────────────────
  const refreshUserProfile = async (uid, email, displayName) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("No authenticated user found");
      }
      const idToken = await currentUser.getIdToken();

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

      const responseText = await res.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonError) {
        throw new Error(
          `Register API JSON nahi bhej rahi. Status: ${res.status}. Response: ${responseText.slice(0, 200)}`
        );
      }

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load user profile");
      }

      if (data?.user) {
        setUserName(data.user.name || "");

        const totalMatches = data.user.matchesPlayed ?? 0;
        setMatchesPlayed(totalMatches);

        const derivedLevel = calculateLevelFromMatches(totalMatches);
        setPlayerLevel(derivedLevel);

        setBgmiIgn(data.user.bgmiIgn || "");
        setBgmiUid(data.user.bgmiUid || "");
        setFfIgn(data.user.ffIgn || "");
        setFfUid(data.user.ffUid || "");
        setBio(data.user.bio || "Ready for the battle! Multi-Game Competitive Esports Player.");
        setTempBgmiIgn(data.user.bgmiIgn || "");
        setTempBgmiUid(data.user.bgmiUid || "");
        setTempFfIgn(data.user.ffIgn || "");
        setTempFfUid(data.user.ffUid || "");
        setTempBio(data.user.bio || "Ready for the battle! Multi-Game Competitive Esports Player.");

        try {
          const mhRes = await fetch(`/api/user/match-history?email=${encodeURIComponent(email)}`);
          const mhData = await mhRes.json();
          if (mhData.success) setMatchHistory(mhData.matches);
        } catch (mhErr) {
          console.error("Match history fetch error:", mhErr);
        }
      }

      const protRes = await fetch(`/api/user/protection-status?email=${encodeURIComponent(email)}`);
      const protText = await protRes.text();

      let protData;
      try {
        protData = JSON.parse(protText);
      } catch (jsonError) {
        throw new Error(
          `Protection API JSON nahi bhej rahi. Status: ${protRes.status}. Response: ${protText.slice(0, 200)}`
        );
      }

      if (!protRes.ok) {
        throw new Error(protData?.error || "Failed to load protection status");
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

  // ─── Auto-refresh level every 15 seconds — no manual refresh needed ────────
  useEffect(() => {
    if (!firebaseUser) return;

    const interval = setInterval(() => {
      refreshUserProfile(firebaseUser.uid, firebaseUser.email, firebaseUser.displayName);
    }, 15000);

    return () => clearInterval(interval);
  }, [firebaseUser]);

  // ─── Recompute level whenever matchesPlayed changes ────────────────────────
  useEffect(() => {
    const derivedLevel = calculateLevelFromMatches(matchesPlayed);
    if (derivedLevel !== playerLevel) {
      setPlayerLevel(derivedLevel);
    }
  }, [matchesPlayed]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

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

  // ─── Match History ──────────────────────────────────────────────────────────
  const [matchHistory, setMatchHistory] = useState([]);

  // ─── Upload Match Screenshot ────────────────────────────────────────────────
  const handleUploadScreenshot = async (tournamentName, dbMatchId) => {
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
      const res = await fetch("/api/match/upload-ss", { method: "POST", body: formData });
      const responseText = await res.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonError) {
        throw new Error(`Upload API JSON nahi de rahi. Status: ${res.status}. Response: ${responseText.slice(0, 200)}`);
      }

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Upload failed with status ${res.status}`);
      }

      if (data.success) {
        alert("🎉 Match screenshot uploaded successfully! Your screenshot is now pending admin verification. Once verified, your reward will show up under Pending Rewards.");
        setMatchScreenshot(null);
        setMatchHistory((prev) =>
          prev.map((m) =>
            String(m.dbMatchId) === String(dbMatchId)
              ? { ...m, screenshotUrl: data?.matchRecord?.screenshotUrl || null }
              : m
          )
        );
      } else {
        alert("Error: " + (data?.error || data?.message || "Screenshot upload failed."));
      }
    } catch (err) {
      console.error("Upload Error:", err);
      alert(err?.message || "Kuch gadbad ho gayi, dubara try karo.");
    } finally {
      setUploadingSS(false);
    }
  };

  // ─── Time Ago ────────────────────────────────────────────────────────────────
  const getTimeAgo = (dateString) => {
    if (!dateString) return "Just now";
    const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (diff < 60) return "Just now";
    const m = Math.floor(diff / 60);
    if (m < 60) return `${m} mins ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hours ago`;
    return `${Math.floor(h / 24)} days ago`;
  };

  // ─── XP Info ─────────────────────────────────────────────────────────────────
  const handleXpInfoClick = () => {
    setXpModalMessage(
      "Match XP increases automatically every time you join and complete a tournament match. Keep playing regularly to level up."
    );
    setTimeout(() => setXpModalMessage(null), 4000);
  };

  // ─── Inactivity Info ─────────────────────────────────────────────────────────
  const handleInactivityInfoClick = () => {
    setInactivityModalMessage(
      protectionPoints > 0
        ? `🛡️ Protection active: your rank is currently safeguarded. If you stay inactive for more than 2 days, 1 Protection Point will be used automatically to prevent an XP or rank drop.`
        : `⚠️ You have 0 Protection Points left. If you stay inactive for more than 2 days without joining a match, your XP and rank tier may be penalized.`
    );
    setTimeout(() => setInactivityModalMessage(null), 4000);
  };

  // ─── Share Match ─────────────────────────────────────────────────────────────
  const handleShareMatch = (match) => {
    const shareText =
      `I just joined ${match.tournamentName} (${match.mapName}) on Battle Crown! ` +
      `Join in and compete for cash prizes. 🏆`;

    if (navigator.share) {
      navigator.share({ title: "Battle Crown Match", text: shareText, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard
        .writeText(shareText)
        .then(() => {
          setShareMessage("Match details copied to clipboard.");
          setTimeout(() => setShareMessage(null), 3000);
        })
        .catch(() => setShareMessage("Copy failed."));
    }
  };

  // ─── Profile Save (used by ProfileTab) ──────────────────────────────────────
  const handleSaveProfile = async () => {
    setBgmiIgn(tempBgmiIgn);
    setBgmiUid(tempBgmiUid);
    setFfIgn(tempFfIgn);
    setFfUid(tempFfUid);
    setIsEditingProfile(false);

    try {
      await fetch("/api/user/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          bgmiIgn: tempBgmiIgn,
          bgmiUid: tempBgmiUid,
          ffIgn: tempFfIgn,
          ffUid: tempFfUid,
        }),
      });
    } catch (err) {
      console.error("Profile save error:", err);
    }
  };

  // ─── Bio Save (used by ProfileTab) ──────────────────────────────────────────
  const handleSaveBio = async () => {
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
        body: JSON.stringify({ email: userEmail, bio: tempBio }),
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
  };

  const handleOpenJoinFlow = (tournament) => {
    setActiveMatch(tournament);
    setHasAgreedRules(false);
    setIsRulesModalOpen(true);
  };

  // Bottom-nav navigation. HomeTab's "Choose Your Battle" buttons call this
  // with a 2nd arg (e.g. onNavigate("battles", "bgmi")) to also pre-select
  // the game filter when jumping to the Battles tab.
  const handleNavigate = (tab, gameFilter) => {
    if (gameFilter) setSelectedGameTab(gameFilter);
    setActiveTab(tab);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f17] flex items-center justify-center text-cyan-400 font-mono text-sm animate-pulse">
        LOADING BATTLE CROWN DASHBOARD...
      </div>
    );
  }

  return (
    <>
      {/* ─── Active Tab ──────────────────────────────────────────────────────── */}
      {activeTab === "home" && (
        <HomeTab
          displayName={userName || "Player"}
          playerLevel={playerLevel}
          protectionPoints={protectionPoints}
          bgmiIgn={bgmiIgn}
          bgmiUid={bgmiUid}
          ffIgn={ffIgn}
          ffUid={ffUid}
          tournaments={tournaments}
          liveTournament={tournaments.find((t) => t.status === "live") || null}
          startingSoon={tournaments.slice(0, 2)}
          matchesTowardNext={matchesTowardNext}
          matchesNeededForNext={matchesNeededForNext}
          bgmiCount={tournaments.filter((t) => t.game?.toLowerCase().includes("bgmi")).length}
          ffCount={tournaments.filter((t) => t.game?.toLowerCase().includes("free")).length}
          onJoin={handleOpenJoinFlow}
          onAboutClick={() => setIsAboutModalOpen(true)}
          onSupportClick={() => setIsSupportModalOpen(true)}
          onNavigate={handleNavigate}
          activeTab={activeTab}
        />
      )}

      {activeTab === "battles" && (
        <BattlesTab
          tournaments={tournaments}
          selectedGameTab={selectedGameTab}
          setSelectedGameTab={setSelectedGameTab}
          onJoin={handleOpenJoinFlow}
          onNavigate={handleNavigate}
          activeTab={activeTab}
          onMatchHistoryClick={() => setIsMatchHistoryOpen(true)}
        />
      )}

      {isMatchHistoryOpen && (
  <MatchHistoryModal
    email={userEmail}  // tumhara actual logged-in user email variable
    onClose={() => setIsMatchHistoryOpen(false)}
  />
)}

      {activeTab === "wallet" && (
        <WalletTab
          userEmail={userEmail}
          getIdToken={getIdToken}
          onNavigate={handleNavigate}
          activeTab={activeTab}
        />
      )}

      {activeTab === "profile" && (
        <ProfileTab
          displayName={bgmiIgn || "Player"}
          playerLevel={playerLevel}
          currentTier={currentTier}
          bgmiIgn={bgmiIgn}
          bgmiUid={bgmiUid}
          ffIgn={ffIgn}
          ffUid={ffUid}
          isEditingProfile={isEditingProfile}
          setIsEditingProfile={setIsEditingProfile}
          tempBgmiIgn={tempBgmiIgn}
          setTempBgmiIgn={setTempBgmiIgn}
          tempBgmiUid={tempBgmiUid}
          setTempBgmiUid={setTempBgmiUid}
          tempFfIgn={tempFfIgn}
          setTempFfIgn={setTempFfIgn}
          tempFfUid={tempFfUid}
          setTempFfUid={setTempFfUid}
          onSaveProfile={handleSaveProfile}
          bio={bio}
          isEditingBio={isEditingBio}
          tempBio={tempBio}
          setTempBio={setTempBio}
          bioError={bioError}
          onEditBio={() => {
            setTempBio(bio || "");
            setIsEditingBio(true);
          }}
          onSaveBio={handleSaveBio}
          unlockedBadges={getUnlockedBadges()}
          totalBadges={levelBadgesMap.length}
          matchesTowardNext={matchesTowardNext}
          matchesNeededForNext={matchesNeededForNext}
          protectionPoints={protectionPoints}
          onXpInfoClick={handleXpInfoClick}
          onInactivityInfoClick={handleInactivityInfoClick}
          xpModalMessage={xpModalMessage}
          inactivityModalMessage={inactivityModalMessage}
          onOpenLevelModal={() => setIsLevelModalOpen(true)}
          onNavigate={handleNavigate}
          activeTab={activeTab}
        />
      )}

      {/* ─── Level & Badges Modal ────────────────────────────────────────────── */}
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
              {levelBadgesMap.map((tier) => (
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setIsLevelModalOpen(false)} className="px-4 py-2 bg-yellow-500 text-black font-bold text-xs uppercase cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Match History Modal ─────────────────────────────────────────────── */}
      {isMatchHistoryOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f141c] border border-gray-800 p-5 max-w-lg w-full space-y-3 rounded-xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2 flex-shrink-0">
              <h2 className="text-sm font-mono uppercase tracking-widest font-bold text-gray-400">// RECENT MATCH HISTORY (LATEST 5)</h2>
              <button onClick={() => setIsMatchHistoryOpen(false)} className="text-gray-400 hover:text-white text-xs cursor-pointer">✕</button>
            </div>
            {shareMessage && <p className="text-[10px] text-cyan-300 italic">{shareMessage}</p>}
            <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
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
                            <span className="text-[10px] text-gray-400 italic">*Upload proof</span>
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
        </div>
      )}

      {/* ─── Step 1: Rules ────────────────────────────────────────────────────── */}
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
                <p className="font-bold text-yellow-400 mb-1">9. Payment & Payout Rules</p>
                <ul className="list-disc pl-4 space-y-0.5 text-gray-400">
                  <li>Entry fees are paid directly per tournament — Battle Crown does not hold a stored balance for you.</li>
                  <li>Prize money is paid out via UPI after admin verification of your result.</li>
                  <li>Battle Crown may require KYC verification before processing payouts as per applicable requirements.</li>
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
                <p className="text-gray-400 mb-1">Battle Crown stores: Email, Game UID, IGN, Match History, and Payment History.</p>
                <p className="text-gray-400">Data is used only for tournament operations.</p>
                <p className="text-gray-400">Battle Crown does not sell user personal information to third parties.</p>
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

      {/* ─── Step 2: Prize Pool Details ───────────────────────────────────────── */}
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
                <p className="text-yellow-400 font-bold text-xs uppercase tracking-wider">⚔️ GOOD LUCK, WARRIOR! ⚔️</p>
                <p className="text-gray-300 text-[11px] font-mono mt-1">
                  Enter the battlefield, trust your skills & fight till the final zone. Play fair. Stay focused. Claim your Crown! 👑🔥
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

      {/* ─── Step 3: Player Details Form ──────────────────────────────────────── */}
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

      {/* ─── Step 4: Final Confirmation ───────────────────────────────────────── */}
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
                  setIsSubmitting(true);

                  try {
                    const idToken = await getIdToken();
                    if (!idToken) {
                      alert("Please log in again.");
                      return;
                    }

                    const res = await fetch(`/api/tournament/${activeMatch.id}/join`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${idToken}`,
                      },
                      body: JSON.stringify({
                        whatsapp: playerWhatsapp,
                        ign: playerIgnInput,
                        uid: playerUidInput,
                      }),
                    });

                    const data = await res.json();

                    if (!data.success) {
                      alert(data.message || "Failed to initiate payment");
                      return;
                    }

                    const cashfree = new window.Cashfree({
                      mode: "sandbox",
                    });

                    cashfree.checkout({
                      paymentSessionId: data.payment_session_id,
                      redirectTarget: "_self",
                    });

                    setIsConfirmModalOpen(false);

                  } catch (error) {
                    console.error("Join Error:", error);
                    alert("Something went wrong while joining");
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

      {/* ─── About Modal ──────────────────────────────────────────────────────── */}
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
                  <li>🥉 3rd Place: 5% of total entry fees</li>
                  <li>🎯 Per Kill Bounty: ₹5/kill • Higher entry = Higher kill reward</li>
                </ul>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setIsAboutModalOpen(false)} className="px-5 py-2 bg-cyan-400 text-black font-black text-xs uppercase cursor-pointer rounded">Got It</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Support Modal ────────────────────────────────────────────────────── */}
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
              <p className="text-gray-300">📧 <strong>Official Email:</strong> battlecrownsupport@gmail.com</p>
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
    </>
  );
}

import { Suspense } from "react";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0b0f17] flex items-center justify-center text-cyan-400 font-mono text-sm animate-pulse">
          LOADING BATTLE CROWN DASHBOARD...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}