import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";

/**
 * GET /api/tasks
 * Lists active campaigns and tasks for the active Whitelist program.
 * Query param: ?programSlug=... (default: "chimphood-wl-main" or latest OPEN program)
 * If authenticated via SIWE session, includes the user's task progress and latest evidence submission.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const programSlug = url.searchParams.get("programSlug") || "chimphood-wl-main";

  try {
    let program = await prisma.wLProgram.findUnique({
      where: { slug: programSlug },
    });

    if (!program) {
      program = await prisma.wLProgram.findFirst({
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!program) {
      return Response.json({
        configured: false,
        message: "No Whitelist program is currently active.",
        campaigns: [],
      });
    }

    let session = null;
    try {
      session = await authenticateRequest(prisma);
    } catch {
      session = null;
    }

    const campaigns = await prisma.promoCampaign.findMany({
      where: {
        wlProgramId: program.id,
        status: "ACTIVE",
      },
      include: {
        versions: {
          where: { isCurrent: true },
          include: {
            tasks: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const taskIds = campaigns.flatMap((c) =>
      (c.versions[0]?.tasks ?? []).map((t) => t.id),
    );

    const taskProgressMap = new Map<string, any>();
    if (session?.userId && taskIds.length > 0) {
      const progresses = await prisma.taskProgress.findMany({
        where: {
          userId: session.userId,
          taskId: { in: taskIds },
        },
        include: {
          evidenceSubmissions: {
            orderBy: { createdAt: "desc" },
          },
        },
      });
      for (const p of progresses) {
        taskProgressMap.set(p.taskId, p);
      }
    }

    const formattedCampaigns = campaigns.map((c) => {
      const version = c.versions[0] ?? null;
      const tasks = (version?.tasks ?? []).map((task) => {
        const progress = taskProgressMap.get(task.id);
        const latestSubmission = progress?.evidenceSubmissions?.[0] ?? null;
        return {
          id: task.id,
          versionId: task.versionId,
          campaignId: c.id,
          taskCode: task.taskCode,
          title: task.title,
          description: task.description,
          taskType: task.taskType,
          points: task.points,
          isRequired: task.isRequired,
          sortOrder: task.sortOrder,
          requirementMetadata: task.requirementMetadata,
          progress: progress
            ? {
                id: progress.id,
                status: progress.status,
                verifiedAt:
                  progress.verifiedAt instanceof Date
                    ? progress.verifiedAt.toISOString()
                    : (progress.verifiedAt ?? null),
                completedAt:
                  progress.completedAt instanceof Date
                    ? progress.completedAt.toISOString()
                    : (progress.completedAt ?? null),
              }
            : null,
          latestSubmission: latestSubmission
            ? {
                id: latestSubmission.id,
                submissionType: latestSubmission.submissionType,
                payload: latestSubmission.payload,
                status: latestSubmission.status,
                reviewerNotes: latestSubmission.reviewerNotes ?? null,
                reviewedAt:
                  latestSubmission.reviewedAt instanceof Date
                    ? latestSubmission.reviewedAt.toISOString()
                    : (latestSubmission.reviewedAt ?? null),
                createdAt:
                  latestSubmission.createdAt instanceof Date
                    ? latestSubmission.createdAt.toISOString()
                    : String(latestSubmission.createdAt),
              }
            : null,
        };
      });

      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        status: c.status,
        wlProgramId: c.wlProgramId,
        version: version
          ? {
              id: version.id,
              versionNumber: version.versionNumber,
              startsAt:
                version.startsAt instanceof Date
                  ? version.startsAt.toISOString()
                  : String(version.startsAt),
              endsAt:
                version.endsAt instanceof Date
                  ? version.endsAt.toISOString()
                  : (version.endsAt ?? null),
            }
          : null,
        tasks,
      };
    });

    return Response.json({
      configured: true,
      program: {
        id: program.id,
        slug: program.slug,
        name: program.name,
      },
      campaigns: formattedCampaigns,
    });
  } catch (err: unknown) {
    console.error("GET /api/tasks unexpected error:", err);
    return Response.json(
      {
        error: "SERVER_ERROR",
        message: "An unexpected error occurred while fetching active tasks.",
      },
      { status: 500 },
    );
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: "METHOD_NOT_ALLOWED", message: "Method not allowed. Use GET." },
    { status: 405, headers: { Allow: "GET" } },
  );
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const HEAD = methodNotAllowed;
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: { Allow: "GET, OPTIONS" } });
}
