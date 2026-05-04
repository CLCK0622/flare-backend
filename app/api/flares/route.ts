import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, matches, users, blocks } from "@/db/schema";
import { eq, and, gt, sql, notInArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { clampString, validLat, validLng, positiveInt } from "@/lib/validate";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// GET /api/flares?lat=40.11&lng=-88.24&radius_km=5&category=Sports&limit=50
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") || "40.1164");
  const lng = parseFloat(searchParams.get("lng") || "-88.2434");
  const radiusKm = parseFloat(searchParams.get("radius_km") || "5");
  const category = searchParams.get("category");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 100);

  if (!validLat(lat) || !validLng(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const radiusMeters = Math.min(radiusKm, 50) * 1000;

  const conditions = [
    eq(flares.status, "active"),
    gt(flares.expiresAt, new Date()),
    sql`earth_distance(ll_to_earth(${flares.latitude}, ${flares.longitude}), ll_to_earth(${lat}, ${lng})) < ${radiusMeters}`,
  ];

  if (category) {
    conditions.push(eq(flares.category, category));
  }

  // Exclude flares from blocked users (if authenticated)
  const user = await getCurrentUser(request);
  if (user) {
    const blockedRows = await db
      .select({ blockedId: blocks.blockedId })
      .from(blocks)
      .where(eq(blocks.blockerId, user.id));

    const blockedIds = blockedRows.map((r) => r.blockedId);
    if (blockedIds.length > 0) {
      conditions.push(notInArray(flares.userId, blockedIds));
    }
  }

  const results = await db
    .select({
      id: flares.id,
      userId: flares.userId,
      userName: users.name,
      activity: flares.activity,
      category: flares.category,
      description: flares.description,
      timeframe: flares.timeframe,
      timeLabel: flares.timeLabel,
      locationName: flares.locationName,
      locationAddress: flares.locationAddress,
      latitude: flares.latitude,
      longitude: flares.longitude,
      maxSlots: flares.maxSlots,
      requiresApproval: flares.requiresApproval,
      status: flares.status,
      expiresAt: flares.expiresAt,
      createdAt: flares.createdAt,
      distanceKm: sql<number>`earth_distance(ll_to_earth(${flares.latitude}, ${flares.longitude}), ll_to_earth(${lat}, ${lng})) / 1000`,
    })
    .from(flares)
    .innerJoin(users, eq(flares.userId, users.id))
    .where(and(...conditions))
    .orderBy(
      sql`earth_distance(ll_to_earth(${flares.latitude}, ${flares.longitude}), ll_to_earth(${lat}, ${lng}))`
    )
    .limit(limit);

  return NextResponse.json(results);
}

// POST /api/flares — create a new flare
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`flare:create:${user.id}`, 5, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const body = await request.json();
  const {
    activity,
    category,
    description,
    timeframe,
    timeLabel,
    locationName,
    locationAddress,
    latitude,
    longitude,
    maxSlots,
    requiresApproval,
  } = body;

  if (!activity || !timeframe || latitude == null || longitude == null) {
    return NextResponse.json(
      { error: "activity, timeframe, latitude, longitude are required" },
      { status: 400 }
    );
  }

  if (!validLat(latitude) || !validLng(longitude)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const validTimeframes = ["NOW", "IN_AN_HOUR", "LATER_TODAY", "TOMORROW"];
  if (!validTimeframes.includes(timeframe)) {
    return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });
  }

  // Compute expiry based on timeframe
  const now = new Date();
  let expiresAt: Date;
  switch (timeframe) {
    case "NOW":
      expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      break;
    case "IN_AN_HOUR":
      expiresAt = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      break;
    case "LATER_TODAY":
      expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      break;
    case "TOMORROW":
      expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      break;
    default:
      expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  const [flare] = await db
    .insert(flares)
    .values({
      userId: user.id,
      activity: clampString(activity, 200),
      category: clampString(category, 50),
      description: clampString(description, 500),
      timeframe,
      timeLabel: clampString(timeLabel, 100),
      locationName: clampString(locationName, 200),
      locationAddress: clampString(locationAddress, 300),
      latitude,
      longitude,
      maxSlots: positiveInt(maxSlots, 1),
      requiresApproval: requiresApproval || false,
      expiresAt,
    })
    .returning();

  // Auto-enroll the creator as an accepted match
  const chatExpiresAt = new Date(expiresAt.getTime() + 48 * 60 * 60 * 1000);
  await db.insert(matches).values({
    flareId: flare.id,
    responderId: user.id,
    status: "accepted",
    chatExpiresAt,
  });

  return NextResponse.json(flare, { status: 201 });
}
