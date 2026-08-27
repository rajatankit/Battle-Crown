const CORTEX_BRIDGE_URL = process.env.CORTEX_BRIDGE_URL;
const CORTEX_BRIDGE_TOKEN = process.env.CORTEX_BRIDGE_TOKEN;

export async function cortexDispatch({
  agentId,
  action,
  task,
  context = {},
}) {
  if (!CORTEX_BRIDGE_URL) {
    throw new Error("CORTEX_BRIDGE_URL is not configured.");
  }

  if (!CORTEX_BRIDGE_TOKEN) {
    throw new Error("CORTEX_BRIDGE_TOKEN is not configured.");
  }

  const baseUrl = CORTEX_BRIDGE_URL.replace(/\/+$/, "");
  const dispatchUrl = `${baseUrl}/dispatch`;

  let response;

  try {
    response = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${CORTEX_BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({
        agent_id: agentId,
        action,
        task,
        context,
      }),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `Unable to connect to CORTEX bridge: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const rawBody = await response.text();

  let data = null;

  if (rawBody.trim()) {
    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(rawBody);
      } catch {
        throw new Error(
          `CORTEX returned invalid JSON. HTTP ${response.status}.`
        );
      }
    } else {
      const preview = rawBody.replace(/\s+/g, " ").slice(0, 200);
      throw new Error(
        `CORTEX returned non-JSON response. HTTP ${response.status}. Response: ${preview}`
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      data?.detail ||
        data?.message ||
        `CORTEX bridge request failed with HTTP ${response.status}.`
    );
  }

  if (!data) {
    throw new Error("CORTEX returned an empty response.");
  }

  return data;
}