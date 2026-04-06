import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, matches, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

// GET /api/flares/:id/requests — get pending join requests (flare owner only)
export async function GET(
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

  if (flare.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = await db
    .select({
      id: matches.id,
      flareId: matches.flareId,
      responderId: matches.responderId,
      responderName: users.name,
      status: matches.status,
      createdAt: matches.createdAt,
    })
    .from(matches)
    .innerJoin(users, eq(matches.responderId, users.id))
    .where(
      and(eq(matches.flareId, flareId), eq(matches.status, "pending"))
    );

  return NextResponse.json(results);
}
