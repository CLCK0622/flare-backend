import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { recurringFlares } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString, validLat, validLng } from "@/lib/validate";

// GET /api/recurring — list current user's recurring flares
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await db
    .select()
    .from(recurringFlares)
    .where(eq(recurringFlares.userId, user.id));

  return NextResponse.json(results);
}

// POST /api/recurring — create a recurring flare
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`recurring:${user.id}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const body = await request.json();
  const {
    activity,
    category,
    description,
    timeframe,
    dayOfWeek,
    locationName,
    locationAddress,
    latitude,
    longitude,
  } = body;

  const trimmedActivity = typeof activity === "string" ? activity.trim() : "";
  if (!trimmedActivity) {
    return NextResponse.json(
      { error: "activity is required" },
      { status: 400 }
    );
  }

  const trimmedTimeframe = typeof timeframe === "string" ? timeframe.trim() : "";
  if (!trimmedTimeframe) {
    return NextResponse.json(
      { error: "timeframe is required" },
      { status: 400 }
    );
  }

  if (
    typeof dayOfWeek !== "number" ||
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6
  ) {
    return NextResponse.json(
      { error: "dayOfWeek must be an integer between 0 and 6" },
      { status: 400 }
    );
  }

  if (!validLat(latitude)) {
    return NextResponse.json(
      { error: "latitude must be a number between -90 and 90" },
      { status: 400 }
    );
  }

  if (!validLng(longitude)) {
    return NextResponse.json(
      { error: "longitude must be a number between -180 and 180" },
      { status: 400 }
    );
  }

  const [row] = await db
    .insert(recurringFlares)
    .values({
      userId: user.id,
      activity: clampString(trimmedActivity, 200),
      category: clampString(category, 50),
      description: clampString(description, 500),
      timeframe: clampString(trimmedTimeframe, 20),
      dayOfWeek,
      locationName: clampString(locationName, 200),
      locationAddress: clampString(locationAddress, 300),
      latitude,
      longitude,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}

// DELETE /api/recurring — delete a recurring flare (body: { id })
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const deleted = await db
    .delete(recurringFlares)
    .where(
      and(eq(recurringFlares.id, id), eq(recurringFlares.userId, user.id))
    )
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Recurring flare not found or not owned by you" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}

// PATCH /api/recurring — toggle active/inactive (body: { id, active })
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, active } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (typeof active !== "boolean") {
    return NextResponse.json(
      { error: "active must be a boolean" },
      { status: 400 }
    );
  }

  const updated = await db
    .update(recurringFlares)
    .set({ active })
    .where(
      and(eq(recurringFlares.id, id), eq(recurringFlares.userId, user.id))
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "Recurring flare not found or not owned by you" },
      { status: 404 }
    );
  }

  return NextResponse.json(updated[0]);
}
