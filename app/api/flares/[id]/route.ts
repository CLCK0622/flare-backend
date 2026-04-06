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

// PATCH /api/flares/:id — cancel own flare
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { status } = await request.json();

  if (status !== "cancelled") {
    return NextResponse.json(
      { error: "Only cancellation is allowed" },
      { status: 400 }
    );
  }

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

  const [updated] = await db
    .update(flares)
    .set({ status: "cancelled" })
    .where(eq(flares.id, id))
    .returning();

  return NextResponse.json(updated);
}
