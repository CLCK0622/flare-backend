import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, matches, ratings } from "@/db/schema";
import { eq, and, sql, gte, avg, count } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// GET /api/analytics — get current user's analytics
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`analytics:${user.id}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  // Flares per week for the last 12 weeks
  const flaresPerWeek = await db
    .select({
      week: sql<string>`to_char(${flares.createdAt}, 'IYYY-"W"IW')`,
      count: count(),
    })
    .from(flares)
    .where(
      and(
        eq(flares.userId, user.id),
        gte(flares.createdAt, twelveWeeksAgo)
      )
    )
    .groupBy(sql`to_char(${flares.createdAt}, 'IYYY-"W"IW')`)
    .orderBy(sql`to_char(${flares.createdAt}, 'IYYY-"W"IW')`);

  // Top category
  const topCategoryResult = await db
    .select({
      category: flares.category,
      count: count(),
    })
    .from(flares)
    .where(eq(flares.userId, user.id))
    .groupBy(flares.category)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  const topCategory = topCategoryResult[0]?.category || null;

  // Peak hour
  const peakHourResult = await db
    .select({
      hour: sql<number>`extract(hour from ${flares.createdAt})`,
      count: count(),
    })
    .from(flares)
    .where(eq(flares.userId, user.id))
    .groupBy(sql`extract(hour from ${flares.createdAt})`)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  const peakHour = peakHourResult[0]?.hour ?? null;

  // Total flares
  const [totalFlaresResult] = await db
    .select({ count: count() })
    .from(flares)
    .where(eq(flares.userId, user.id));

  const totalFlares = totalFlaresResult.count;

  // Total accepted matches (as host or responder)
  const [matchesAsResponder] = await db
    .select({ count: count() })
    .from(matches)
    .where(
      and(eq(matches.responderId, user.id), eq(matches.status, "accepted"))
    );

  const [matchesAsHost] = await db
    .select({ count: count() })
    .from(matches)
    .innerJoin(flares, eq(matches.flareId, flares.id))
    .where(
      and(eq(flares.userId, user.id), eq(matches.status, "accepted"))
    );

  const totalMatches = matchesAsResponder.count + matchesAsHost.count;

  // Average rating
  const [avgRatingResult] = await db
    .select({ avg: avg(ratings.stars) })
    .from(ratings)
    .where(eq(ratings.rateeId, user.id));

  const avgRating = avgRatingResult.avg
    ? parseFloat(Number(avgRatingResult.avg).toFixed(1))
    : null;

  return NextResponse.json({
    flaresPerWeek,
    topCategory,
    peakHour,
    totalFlares,
    totalMatches,
    avgRating,
  });
}
