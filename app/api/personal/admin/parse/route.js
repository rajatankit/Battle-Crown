import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { askCortexRaw } from "../../../../lib/cortex/llm";
import { ADMIN_MODELS } from "../../../../lib/cortex/adminModels";

export async function POST(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  try {
    const { spokenText } = await request.json();
    if (!spokenText?.trim()) {
      return NextResponse.json({ success: false, error: "spokenText required" }, { status: 400 });
    }

    const modelList = Object.entries(ADMIN_MODELS)
      .map(([key, m]) => `- ${key}: ${m.label} (searchable: ${m.searchFields.join(", ")}, editable: ${m.editableFields.join(", ")})`)
      .join("\n");

    const prompt = `Tum ek command parser ho jo Hinglish voice commands ko structured JSON mein badalte ho, database record delete/update karne ke liye.

Available models:
${modelList}

User ka command: "${spokenText}"

Sirf ek JSON object return karo, kuch aur text nahi, is format mein:
{"model": "<model key ya null>", "operation": "delete" ya "update", "searchTerm": "<row dhoondhne wala text, jaise naam/title/email>", "updates": {"<field>": "<value>"}}

updates sirf tab bharo jab operation "update" ho, warna khaali object {} do.
Agar command samajh nahi aata, model ko null rakho.
Sirf raw JSON, koi markdown/backticks nahi.`;

    const raw = await askCortexRaw(prompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ success: false, error: "Command parse nahi ho paya" }, { status: 422 });
    }

    if (
      !parsed.model ||
      !ADMIN_MODELS[parsed.model] ||
      !["delete", "update"].includes(parsed.operation)
    ) {
      return NextResponse.json({ success: false, error: "Command samajh nahi aaya" }, { status: 422 });
    }

    return NextResponse.json({ success: true, parsed });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}