import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { messaging } from "../../../../lib/firebase-admin";
import { askCortexRaw } from "../../../../lib/cortex/llm";

const OWNER_UID = process.env.PERSONAL_ASSISTANT_OWNER_UID || "";
const CRON_SECRET = process.env.CORTEX_CRON_SECRET || "";
const NEWS_API_KEY = process.env.NEWS_API_KEY || "";

const QUERIES = [
  "BGMI ban India",
  "Free Fire India",
  "online gaming India regulation",
  "real money gaming law India",
  "UPI payment rules India",
  "esports India policy",
];

async function getOwnerFcmToken() {
  if (!OWNER_UID) return null;
  const owner = await prisma.user.findUnique({ where: { uid: OWNER_UID } });
  return owner?.fcmToken || null;
}

async function sendPush(token, title, body) {
  if (!token) return;
  try {
    await messaging.send({ token, notification: { title, body } });
  } catch (err) {
    console.error("Push notification failed:", err instanceof Error ? err.message : err);
  }
}

async function fetchHeadlines(query) {
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", query);
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", "5");
  url.searchParams.set("apiKey", NEWS_API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();
  return (data.articles || []).map((a) => ({
    title: a.title,
    description: a.description,
    url: a.url,
    publishedAt: a.publishedAt,
  }));
}

export async function GET(request) {
  const providedSecret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!NEWS_API_KEY) {
    return NextResponse.json({ success: false, error: "NEWS_API_KEY not configured." }, { status: 500 });
  }

  try {
    let allArticles = [];
    for (const q of QUERIES) {
      const articles = await fetchHeadlines(q);
      allArticles = allArticles.concat(articles);
    }

    // Dedupe by URL
    const seen = new Set();
    allArticles = allArticles.filter((a) => {
      if (!a.url || seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    // Skip articles we've already alerted on before (by URL stored in refId)
    const existingRefs = await prisma.alert.findMany({
      where: { type: "news" },
      select: { refId: true },
    });
    const alreadyAlerted = new Set(existingRefs.map((a) => a.refId));
    allArticles = allArticles.filter((a) => !alreadyAlerted.has(a.url));

    if (allArticles.length === 0) {
      return NextResponse.json({ success: true, checked: 0, alertsCreated: 0 });
    }

    const listText = allArticles
      .slice(0, 20)
      .map((a, i) => `${i + 1}. ${a.title} — ${a.description || ""}`)
      .join("\n");

    const prompt = `Neeche kuch news headlines hain. Ye ek online gaming/esports tournament platform (BGMI, Free Fire tournaments, real-money wallet, UPI deposits/withdrawals) ke business owner ke liye hain.

Har headline ke liye judge karo: kya ye is business ko GENUINELY affect kar sakti hai (jaise: gaming ban, regulation change, payment rule change, security threat, competitor news)? Chhoti/generic/unrelated news ko IGNORE karo.

Headlines:
${listText}

Sirf un headlines ke liye jo genuinely relevant hain, is EXACT format mein reply karo (ek line per relevant headline, kuch aur mat likho):
NUMBER|SEVERITY|REASON

SEVERITY sirf "low", "medium", ya "high" ho sakta hai.
Agar KOI bhi headline relevant nahi hai, sirf "NONE" likho.`;

    const raw = await askCortexRaw(prompt);
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

    const createdAlerts = [];
    const ownerToken = await getOwnerFcmToken();

    if (raw.trim().toUpperCase() !== "NONE") {
      for (const line of lines) {
        const match = line.match(/^(\d+)\s*\|\s*(low|medium|high)\s*\|\s*(.+)$/i);
        if (!match) continue;

        const idx = parseInt(match[1], 10) - 1;
        const severity = match[2].toLowerCase();
        const reason = match[3].trim();
        const article = allArticles[idx];
        if (!article) continue;

        const alert = await prisma.alert.create({
          data: {
            type: "news",
            severity,
            title: article.title,
            message: `${reason} (${article.url})`,
            refId: article.url,
          },
        });
        createdAlerts.push(alert);
      }
    }

    for (const alert of createdAlerts) {
      await sendPush(ownerToken, `[NEWS - ${alert.severity.toUpperCase()}] ${alert.title}`, alert.message);
      await prisma.alert.update({ where: { id: alert.id }, data: { notified: true } });
    }

    return NextResponse.json({
      success: true,
      checked: allArticles.length,
      alertsCreated: createdAlerts.length,
    });
  } catch (err) {
    console.error("News monitor failed:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "News monitor failed." },
      { status: 500 }
    );
  }
}