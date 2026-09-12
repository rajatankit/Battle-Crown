import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { notifyTargetedUsers } from "../../../../lib/notifications/notifyUsers";
import { cortexDispatch } from "../../../../lib/cortex/client";

const CRON_SECRET = process.env.CORTEX_CRON_SECRET || "";
const ADMIN_USER_ID = process.env.ADMIN_USER_ID ? parseInt(process.env.ADMIN_USER_ID, 10) : null;

export async function GET(request) {
  const providedSecret =
    request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pending = await prisma.atlasCommitLog.findMany({ where: { status: "pending" } });
    let resolved = 0;

    for (const log of pending) {
      const result = await cortexDispatch({
        agentId: "ATLAS",
        action: "check_deployment_status",
        task: "atlas_build_check",
        context: { commit_sha: log.commitSha },
      });

      const state = result?.data?.state || result?.state;

      if (state === "READY") {
        await prisma.atlasCommitLog.update({
          where: { id: log.id },
          data: { status: "success", resolvedAt: new Date() },
        });

        if (ADMIN_USER_ID) {
          await notifyTargetedUsers({
            userIds: [ADMIN_USER_ID],
            title: "ATLAS build succeeded",
            message: `Boss, ${log.path} ka build safal raha. Live hai.`,
          });
        }
        resolved++;
      } else if (state === "ERROR") {
        let revertMessage = `Build FAIL hua ${log.path} ke liye.`;

        if (log.previousContent) {
          const revertResult = await cortexDispatch({
            agentId: "ATLAS",
            action: "commit_code",
            task: "atlas_auto_revert",
            context: {
              path: log.path,
              code: log.previousContent,
              message: `CORTEX/ATLAS: auto-revert failed build for ${log.path}`,
            },
          });

          revertMessage =
            revertResult?.status === "committed"
              ? `Build FAIL hua ${log.path} ke liye — main automatically purane code pe revert kar diya, Boss.`
              : `Build FAIL hua ${log.path} ke liye, aur revert bhi fail ho gaya — manually check karo.`;
        }

        await prisma.atlasCommitLog.update({
          where: { id: log.id },
          data: { status: "reverted", resolvedAt: new Date() },
        });

        if (ADMIN_USER_ID) {
          await notifyTargetedUsers({
            userIds: [ADMIN_USER_ID],
            title: "ATLAS build FAILED",
            message: revertMessage,
          });
        }
        resolved++;
      }
      // agar BUILDING/QUEUED ya not_found hai, agli cron run mein dobara try hoga
    }

    return NextResponse.json({ success: true, checked: pending.length, resolved });
  } catch (err) {
    console.error("Atlas build monitor failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}