export const DB_SCHEMA_CONTEXT = `
Battle Crown PostgreSQL database schema (columns camelCase hain, case-sensitive - hamesha double quotes mein likho):

"User" (real accounts): "id" (int), "uid", "email", "name", "depositWallet", "winningsWallet", "crowns", "matchesPlayed", "level", "protectionPoints", "lastMatchAt", "createdAt", "bgmiIgn", "bgmiUid", "ffIgn", "ffUid", "fcmToken"

"tournaments": "id" (int), "firestoreId", "title", "game", "map", "mode", "entryFee", "maxSlots", "joinedCount", "status", "createdAt", "firstPrize", "secondPrize", "thirdPrize", "killReward", "roomId", "roomPassword", "startTime", "reminderSent"

"match_history": "id" (int), "userId" (int, "User"."id" se link), "tournamentName", "screenshotUrl", "mapName", "mode", "gameType", "entryFee", "maxSlots", "playerLevel", "ign", "uid", "whatsapp_number", "email", "kills", "prizeWon", "status", "createdAt", "tournamentId" (ye "tournaments"."firestoreId" se match karta hai, int id se nahi)

"wallet_transactions": "id" (int), "userId" (int), "matchId" (int), "amount", "type", "description", "createdAt"

"withdrawal_requests": "id" (int), "userId" (int), "amount", "upiId", "status", "createdAt", "updatedAt"

"Notification": "id", "type", "userId" (Firebase uid string, "User"."id" nahi), "title", "message", "read", "readBy" (array), "createdAt"

"Alert": "id" (int), "type", "severity", "title", "message", "refId", "notified", "acknowledged", "escalations", "createdAt"

"ErrorLog": "id" (int), "route", "message", "stack", "createdAt", "alerted"

"CortexMemory": "id" (int), "fact", "createdAt"

"ConversationLog": "id" (int), "userId" (Firebase uid), "role" ("user"/"cortex"), "message", "createdAt"

KABHI BHI "CortexSecurity", "PersonalPasskey", ya "PersonalPasskeyChallenge" query mat karo - ye security credentials hain, off-limits hain.
`;