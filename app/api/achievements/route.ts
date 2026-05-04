import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  achievements,
  flares,
  matches,
  templates,
  ratings,
} from "@/db/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

const ACHIEVEMENT_DEFS: Record<string, string> = {
  first_flare: "Fire your first flare",
  social_5: "Complete 5 flares",
  veteran_20: "Complete 20 flares",
  template_master: "Create 3 templates",
  night_owl: "Fire a flare after 10pm",
  early_bird: "Fire a flare before 8am",
  five_star: "Receive a 5-star rating",
  popular: "Have 5+ people join a single flare",
  explorer: "Fire flares in 5 different categories",
  streak_7: "7-day streak",
};

// GET /api/achievements — list current user's achievements
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(achievements)
    .where(eq(achievements.userId, user.id));

  return NextResponse.json({ achievements: rows });
}

// POST /api/achievements/check is its own route segment, but we also
// expose POST here as the /check endpoint shares the same logic.
// Recalculate and grant newly earned achievements.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const earned: string[] = [];

  // Count completed flares (user created a flare that has expired, with at
  // least one accepted match, OR user was an accepted responder on an expired flare)
  const [{ count: completedAsHost }] = await db
    .select({ count: sql<number>`count(distinct ${flares.id})` })
    .from(flares)
    .innerJoin(
      matches,
      and(eq(matches.flareId, flares.id), eq(matches.status, "accepted"))
    )
    .where(and(eq(flares.userId, userId), lt(flares.expiresAt, new Date())));

  const [{ count: completedAsResponder }] = await db
    .select({ count: sql<number>`count(distinct ${flares.id})` })
    .from(matches)
    .innerJoin(flares, eq(matches.flareId, flares.id))
    .where(
      and(
        eq(matches.responderId, userId),
        eq(matches.status, "accepted"),
        lt(flares.expiresAt, new Date())
      )
    );

  const completedCount = Number(completedAsHost) + Number(completedAsResponder);

  if (completedCount >= 1) earned.push("first_flare");
  if (completedCount >= 5) earned.push("social_5");
  if (completedCount >= 20) earned.push("veteran_20");

  // Template count
  const [{ count: templateCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(templates)
    .where(eq(templates.userId, userId));

  if (Number(templateCount) >= 3) earned.push("template_master");

  // Night owl / Early bird — check flare creation times
  const [nightOwl] = await db
    .select({ id: flares.id })
    .from(flares)
    .where(
      and(
        eq(flares.userId, userId),
        sql`extract(hour from ${flares.createdAt}) >= 22`
      )
    )
    .limit(1);

  if (nightOwl) earned.push("night_owl");

  const [earlyBird] = await db
    .select({ id: flares.id })
    .from(flares)
    .where(
      and(
        eq(flares.userId, userId),
        sql`extract(hour from ${flares.createdAt}) < 8`
      )
    )
    .limit(1);

  if (earlyBird) earned.push("early_bird");

  // Five-star rating received
  const [fiveStar] = await db
    .select({ id: ratings.id })
    .from(ratings)
    .where(and(eq(ratings.rateeId, userId), eq(ratings.stars, 5)))
    .limit(1);

  if (fiveStar) earned.push("five_star");

  // Popular — 5+ accepted responders on a single flare the user hosts
  const [popular] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(matches)
    .innerJoin(flares, eq(matches.flareId, flares.id))
    .where(and(eq(flares.userId, userId), eq(matches.status, "accepted")))
    .groupBy(matches.flareId)
    .having(sql`count(*) >= 5`)
    .limit(1);

  if (popular) earned.push("popular");

  // Explorer — 5 distinct categories
  const [{ count: categoryCount }] = await db
    .select({
      count: sql<number>`count(distinct ${flares.category})`,
    })
    .from(flares)
    .where(
      and(eq(flares.userId, userId), sql`${flares.category} != ''`)
    );

  if (Number(categoryCount) >= 5) earned.push("explorer");

  // Streak 7 — check if the user fired or joined a flare each of the last 7 days
  const streakResult = await db.execute(sql`
    SELECT count(DISTINCT d)::int AS streak_days
    FROM (
      SELECT date(${flares.createdAt}) AS d
      FROM ${flares}
      WHERE ${flares.userId} = ${userId}
        AND ${flares.createdAt} >= now() - interval '7 days'
      UNION
      SELECT date(${matches.createdAt}) AS d
      FROM ${matches}
      WHERE ${matches.responderId} = ${userId}
        AND ${matches.createdAt} >= now() - interval '7 days'
    ) sub
  `);

  const streakDays = Number(streakResult.rows?.[0]?.streak_days ?? 0);
  if (streakDays >= 7) earned.push("streak_7");

  // Insert newly earned (ON CONFLICT DO NOTHING)
  const newlyUnlocked: string[] = [];
  for (const key of earned) {
    try {
      const [inserted] = await db
        .insert(achievements)
        .values({ userId, key })
        .onConflictDoNothing({ target: [achievements.userId, achievements.key] })
        .returning();

      if (inserted) newlyUnlocked.push(key);
    } catch {
      // unique constraint — already exists
    }
  }

  const allAchievements = await db
    .select()
    .from(achievements)
    .where(eq(achievements.userId, userId));

  return NextResponse.json({
    achievements: allAchievements,
    newlyUnlocked,
    definitions: ACHIEVEMENT_DEFS,
  });
}
