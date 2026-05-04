import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, matches, ratings, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validate";

// POST /api/ratings — create a rating
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`ratings:${user.id}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const body = await request.json();
  const { flareId, rateeId, stars, comment } = body;

  if (!flareId || !rateeId) {
    return NextResponse.json(
      { error: "flareId and rateeId are required" },
      { status: 400 }
    );
  }

  if (
    typeof stars !== "number" ||
    !Number.isInteger(stars) ||
    stars < 0 ||
    stars > 5
  ) {
    return NextResponse.json(
      { error: "stars must be an integer between 0 and 5" },
      { status: 400 }
    );
  }

  if (rateeId === user.id) {
    return NextResponse.json(
      { error: "You cannot rate yourself" },
      { status: 400 }
    );
  }

  // Verify the rater is a participant in the flare (host or accepted responder)
  const [flare] = await db
    .select({ id: flares.id, userId: flares.userId })
    .from(flares)
    .where(eq(flares.id, flareId))
    .limit(1);

  if (!flare) {
    return NextResponse.json({ error: "Flare not found" }, { status: 404 });
  }

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
        { error: "You must be a participant in this flare to rate" },
        { status: 403 }
      );
    }
  }

  // Check for duplicate rating
  const [existing] = await db
    .select({ id: ratings.id })
    .from(ratings)
    .where(
      and(
        eq(ratings.raterId, user.id),
        eq(ratings.flareId, flareId),
        eq(ratings.rateeId, rateeId)
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "You have already rated this person for this flare" },
      { status: 409 }
    );
  }

  const [rating] = await db
    .insert(ratings)
    .values({
      flareId,
      raterId: user.id,
      rateeId,
      stars,
      comment: clampString(comment, 500),
    })
    .returning();

  return NextResponse.json(rating, { status: 201 });
}

// GET /api/ratings?userId=xxx — get ratings for a user
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: "userId query parameter is required" },
      { status: 400 }
    );
  }

  const results = await db
    .select({
      id: ratings.id,
      flareId: ratings.flareId,
      raterId: ratings.raterId,
      raterName: users.name,
      rateeId: ratings.rateeId,
      stars: ratings.stars,
      comment: ratings.comment,
      createdAt: ratings.createdAt,
    })
    .from(ratings)
    .innerJoin(users, eq(ratings.raterId, users.id))
    .where(eq(ratings.rateeId, userId))
    .orderBy(desc(ratings.createdAt));

  return NextResponse.json(results);
}
