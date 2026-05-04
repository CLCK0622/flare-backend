import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flareFeedback, flares, matches, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validate";

// GET /api/feedback?flareId=xxx — list feedback for a flare
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const flareId = searchParams.get("flareId");

  if (!flareId) {
    return NextResponse.json(
      { error: "flareId query parameter is required" },
      { status: 400 }
    );
  }

  const results = await db
    .select({
      id: flareFeedback.id,
      flareId: flareFeedback.flareId,
      userId: flareFeedback.userId,
      userName: users.name,
      userPhoto: users.photoUrl,
      photoUrl: flareFeedback.photoUrl,
      note: flareFeedback.note,
      createdAt: flareFeedback.createdAt,
    })
    .from(flareFeedback)
    .innerJoin(users, eq(flareFeedback.userId, users.id))
    .where(eq(flareFeedback.flareId, flareId))
    .orderBy(desc(flareFeedback.createdAt));

  return NextResponse.json(results);
}

// POST /api/feedback — submit feedback for a flare
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`feedback:${user.id}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const body = await request.json();
  const { flareId, photoUrl, note } = body;

  if (!flareId) {
    return NextResponse.json(
      { error: "flareId is required" },
      { status: 400 }
    );
  }

  // Verify the flare exists
  const [flare] = await db
    .select({ id: flares.id, userId: flares.userId })
    .from(flares)
    .where(eq(flares.id, flareId))
    .limit(1);

  if (!flare) {
    return NextResponse.json({ error: "Flare not found" }, { status: 404 });
  }

  // Verify the user is a participant (host or accepted responder)
  const isHost = flare.userId === user.id;

  if (!isHost) {
    const [match] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.flareId, flareId),
          eq(matches.responderId, user.id),
          eq(matches.status, "accepted")
        )
      )
      .limit(1);

    if (!match) {
      return NextResponse.json(
        { error: "You must be a participant in this flare" },
        { status: 403 }
      );
    }
  }

  // Insert (one per user per flare, enforced by unique index)
  const [feedback] = await db
    .insert(flareFeedback)
    .values({
      flareId,
      userId: user.id,
      photoUrl: clampString(photoUrl, 500),
      note: clampString(note, 1000),
    })
    .onConflictDoNothing({
      target: [flareFeedback.flareId, flareFeedback.userId],
    })
    .returning();

  if (!feedback) {
    return NextResponse.json(
      { error: "You have already submitted feedback for this flare" },
      { status: 409 }
    );
  }

  return NextResponse.json(feedback, { status: 201 });
}
