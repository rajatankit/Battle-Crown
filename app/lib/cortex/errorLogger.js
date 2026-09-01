// lib/cortex/errorLogger.js

/**
 * Logs an error from any Cortex route, with the route name for context.
 * Currently logs to console — swap the inside of this function later
 * if you want errors saved to a DB table, file, or external service
 * like Sentry instead.
 */
export async function logCortexError(routeName, error) {
  const message =
    error instanceof Error ? error.message : String(error);
  const stack =
    error instanceof Error ? error.stack : undefined;

  console.error(`[CORTEX ERROR] ${routeName}:`, message);
  if (stack) {
    console.error(stack);
  }
}