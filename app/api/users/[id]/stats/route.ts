import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, matches, ratings } from "@/db/schema";
import { eq, and, or, sql, lte } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;

  const now = new Date();

  // completedFlares: distinct flares where user is an accepted responder
  // AND the flare is finished (expired/cancelled or past expiresAt)
  const [completedRow] = await db
    .select({
      count: sql<number>`count(distinct ${matches.flareId})`,
    })
    .from(matches)
    .innerJoin(flares, eq(matches.flareId, flares.id))
    .where(
      and(
        eq(matches.responderId, userId),
        eq(matches.status, "accepted"),
        or(
          sql`${flares.status} in ('expired', 'cancelled')`,
          lte(flares.expiresAt, now)
        )
      )
    );

  // flaresHosted: flares created by this user that are finished
  const [hostedRow] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(flares)
    .where(
      and(
        eq(flares.userId, userId),
        or(
          sql`${flares.status} in ('expired', 'cancelled')`,
          lte(flares.expiresAt, now)
        )
      )
    );

  // avgRating + ratingCount
  const [ratingRow] = await db
    .select({
      avg: sql<number | null>`avg(${ratings.stars})`,
      count: sql<number>`count(*)`,
    })
    .from(ratings)
    .where(eq(ratings.rateeId, userId));

  return NextResponse.json({
    completedFlares: Number(completedRow?.count ?? 0),
    flaresHosted: Number(hostedRow?.count ?? 0),
    avgRating: ratingRow?.avg != null ? Number(ratingRow.avg) : null,
    ratingCount: Number(ratingRow?.count ?? 0),
  });
}
