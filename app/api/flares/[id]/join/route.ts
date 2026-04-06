import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, matches } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

// POST /api/flares/:id/join
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: flareId } = await params;

  const [flare] = await db
    .select()
    .from(flares)
    .where(eq(flares.id, flareId))
    .limit(1);

  if (!flare) {
    return NextResponse.json({ error: "Flare not found" }, { status: 404 });
  }

  if (flare.status !== "active") {
    return NextResponse.json(
      { error: "Flare is no longer active" },
      { status: 400 }
    );
  }

  if (flare.userId === user.id) {
    return NextResponse.json(
      { error: "Cannot join your own flare" },
      { status: 400 }
    );
  }

  // Check if already joined
  const [existing] = await db
    .select()
    .from(matches)
    .where(
      and(eq(matches.flareId, flareId), eq(matches.responderId, user.id))
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "Already joined this flare" },
      { status: 409 }
    );
  }

  const matchStatus = flare.requiresApproval ? "pending" : "accepted";

  // Chat expires 48h after flare expires
  const chatExpiresAt = new Date(
    flare.expiresAt.getTime() + 48 * 60 * 60 * 1000
  );

  const [match] = await db
    .insert(matches)
    .values({
      flareId,
      responderId: user.id,
      status: matchStatus,
      chatExpiresAt,
    })
    .returning();

  return NextResponse.json(match, { status: 201 });
}
