const CORTEX_BRIDGE_URL = process.env.CORTEX_BRIDGE_URL;
const CORTEX_BRIDGE_TOKEN = process.env.CORTEX_BRIDGE_TOKEN;

function requireBridgeConfig() {
  if (!CORTEX_BRIDGE_URL) {
    throw new Error("CORTEX_BRIDGE_URL is not configured.");
  }

  if (!CORTEX_BRIDGE_TOKEN) {
    throw new Error("CORTEX_BRIDGE_TOKEN is not configured.");
  }
}

async function parseBridgeResponse(response) {
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

export async function cortexDispatch({
  agentId,
  action,
  task,
  context = {},
}) {
  requireBridgeConfig();

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

  return parseBridgeResponse(response);
}

// Forwards an already-verified approval to the CORTEX Python
// backend's /approve endpoint. This should only be called after
// the frontend has completed the required WebAuthn/pattern
// verification steps for the request's risk level — see
// app/api/personal/command/approve/route.js for the gate.
export async function cortexApprove({ requestId, agentId }) {
  requireBridgeConfig();

  const baseUrl = CORTEX_BRIDGE_URL.replace(/\/+$/, "");
  const approveUrl = `${baseUrl}/approve`;

  let response;

  try {
    response = await fetch(approveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${CORTEX_BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({
        request_id: requestId,
        agent_id: agentId,
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

  return parseBridgeResponse(response);
}