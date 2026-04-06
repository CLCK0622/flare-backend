import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, matches, users } from "@/db/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

// GET /api/flares?lat=40.11&lng=-88.24&radius_km=5&category=Sports
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") || "40.1164");
  const lng = parseFloat(searchParams.get("lng") || "-88.2434");
  const radiusKm = parseFloat(searchParams.get("radius_km") || "5");
  const category = searchParams.get("category");

  const radiusMeters = radiusKm * 1000;

  const conditions = [
    eq(flares.status, "active"),
    gt(flares.expiresAt, new Date()),
    sql`earth_distance(ll_to_earth(${flares.latitude}, ${flares.longitude}), ll_to_earth(${lat}, ${lng})) < ${radiusMeters}`,
  ];

  if (category) {
    conditions.push(eq(flares.category, category));
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
    );

  return NextResponse.json(results);
}

// POST /api/flares — create a new flare
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Compute expiry based on timeframe
  const now = new Date();
  let expiresAt: Date;
  switch (timeframe) {
    case "NOW":
      expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2h
      break;
    case "IN_AN_HOUR":
      expiresAt = new Date(now.getTime() + 3 * 60 * 60 * 1000); // +3h
      break;
    case "LATER_TODAY":
      expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // +8h
      break;
    case "TOMORROW":
      expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h
      break;
    default:
      expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  const [flare] = await db
    .insert(flares)
    .values({
      userId: user.id,
      activity,
      category: category || "",
      description: description || "",
      timeframe,
      timeLabel: timeLabel || "",
      locationName: locationName || "",
      locationAddress: locationAddress || "",
      latitude,
      longitude,
      maxSlots: maxSlots || 1,
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
