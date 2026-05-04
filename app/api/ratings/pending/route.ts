import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, matches, ratings, users } from "@/db/schema";
import { eq, and, or, sql, lte } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

// GET /api/ratings/pending — flares the current user still needs to rate
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const finishedCondition = or(
    sql`${flares.status} in ('expired', 'cancelled')`,
    lte(flares.expiresAt, now)
  );

  // 1. Flares where the user is an accepted GUEST — needs to rate the host
  const guestFlares = await db
    .select({
      flareId: flares.id,
      flareActivity: flares.activity,
      rateeId: flares.userId,
      rateeName: users.name,
    })
    .from(matches)
    .innerJoin(flares, eq(matches.flareId, flares.id))
    .innerJoin(users, eq(flares.userId, users.id))
    .where(
      and(
        eq(matches.responderId, user.id),
        eq(matches.status, "accepted"),
        finishedCondition
      )
    );

  // 2. Flares where the user is the HOST — needs to rate each accepted responder
  const hostFlares = await db
    .select({
      flareId: flares.id,
      flareActivity: flares.activity,
      rateeId: matches.responderId,
      rateeName: users.name,
    })
    .from(flares)
    .innerJoin(
      matches,
      and(eq(matches.flareId, flares.id), eq(matches.status, "accepted"))
    )
    .innerJoin(users, eq(matches.responderId, users.id))
    .where(and(eq(flares.userId, user.id), finishedCondition));

  const allPending = [...guestFlares, ...hostFlares];

  if (allPending.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch existing ratings by the current user to filter out already-rated pairs
  const existingRatings = await db
    .select({
      flareId: ratings.flareId,
      rateeId: ratings.rateeId,
    })
    .from(ratings)
    .where(eq(ratings.raterId, user.id));

  const ratedSet = new Set(
    existingRatings.map((r) => `${r.flareId}:${r.rateeId}`)
  );

  const pending = allPending.filter(
    (p) => !ratedSet.has(`${p.flareId}:${p.rateeId}`)
  );

  return NextResponse.json(pending);
}
