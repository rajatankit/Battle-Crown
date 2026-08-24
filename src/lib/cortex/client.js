const CORTEX_BRIDGE_URL = process.env.CORTEX_BRIDGE_URL;
const CORTEX_BRIDGE_TOKEN = process.env.CORTEX_BRIDGE_TOKEN;

export async function cortexDispatch({
  agentId,
  action,
  task,
  context = {},
}) {
  if (!CORTEX_BRIDGE_URL || !CORTEX_BRIDGE_TOKEN) {
    throw new Error("CORTEX bridge configuration is missing.");
  }

  const response = await fetch(`${CORTEX_BRIDGE_URL}/dispatch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.detail || data?.message || "CORTEX bridge request failed."
    );
  }

  return data;
}