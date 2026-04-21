import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

// GET /api/flares/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [result] = await db
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
    })
    .from(flares)
    .innerJoin(users, eq(flares.userId, users.id))
    .where(eq(flares.id, id))
    .limit(1);

  if (!result) {
    return NextResponse.json({ error: "Flare not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

// Recompute the flare's expiration when timeframe is edited.
// Mirrors the mapping used on create.
function expiresAtForTimeframe(timeframe: string): Date {
  const now = new Date();
  switch (timeframe) {
    case "NOW":
      return new Date(now.getTime() + 2 * 60 * 60 * 1000);
    case "IN_AN_HOUR":
      return new Date(now.getTime() + 3 * 60 * 60 * 1000);
    case "LATER_TODAY":
      return new Date(now.getTime() + 8 * 60 * 60 * 1000);
    case "TOMORROW":
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

// PATCH /api/flares/:id — edit or cancel own flare.
//
// If `status: "cancelled"` is in the body, the flare is cancelled.
// Otherwise any subset of {activity, category, description, timeframe,
// timeLabel, locationName, locationAddress, latitude, longitude,
// requiresApproval} may be provided and will be applied. Only the flare
// owner may edit; 403 otherwise. Cancelled/expired flares can't be edited.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const [flare] = await db
    .select()
    .from(flares)
    .where(eq(flares.id, id))
    .limit(1);

  if (!flare) {
    return NextResponse.json({ error: "Flare not found" }, { status: 404 });
  }

  if (flare.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cancellation is its own shortcut: `{status:"cancelled"}` short-circuits.
  if (body.status !== undefined) {
    if (body.status !== "cancelled") {
      return NextResponse.json(
        { error: "Only 'cancelled' is a valid status update" },
        { status: 400 }
      );
    }
    const [cancelled] = await db
      .update(flares)
      .set({ status: "cancelled" })
      .where(eq(flares.id, id))
      .returning();
    return NextResponse.json(cancelled);
  }

  if (flare.status !== "active") {
    return NextResponse.json(
      { error: "Only active flares can be edited" },
      { status: 400 }
    );
  }

  // Whitelist editable fields and coerce types lightly.
  const updates: Record<string, unknown> = {};
  const copy = <K extends string>(key: K, coerce: (v: unknown) => unknown = (v) => v) => {
    if (body[key] !== undefined) updates[key] = coerce(body[key]);
  };
  copy("activity", (v) => String(v));
  copy("category", (v) => String(v));
  copy("description", (v) => String(v));
  copy("timeLabel", (v) => String(v));
  copy("locationName", (v) => String(v));
  copy("locationAddress", (v) => String(v));
  copy("latitude", (v) => Number(v));
  copy("longitude", (v) => Number(v));
  copy("requiresApproval", (v) => Boolean(v));

  // If timeframe changes, recompute expiresAt so the new window makes sense.
  if (body.timeframe !== undefined && body.timeframe !== flare.timeframe) {
    updates.timeframe = String(body.timeframe);
    updates.expiresAt = expiresAtForTimeframe(String(body.timeframe));
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(flare); // no-op
  }

  const [updated] = await db
    .update(flares)
    .set(updates)
    .where(eq(flares.id, id))
    .returning();

  return NextResponse.json(updated);
}
