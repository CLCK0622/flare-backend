import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, matches } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

// PATCH /api/matches/:id — accept or pass a join request (flare owner only)
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

  if (status !== "accepted" && status !== "passed") {
    return NextResponse.json(
      { error: "Status must be 'accepted' or 'passed'" },
      { status: 400 }
    );
  }

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, id))
    .limit(1);

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Verify caller is the flare owner
  const [flare] = await db
    .select()
    .from(flares)
    .where(eq(flares.id, match.flareId))
    .limit(1);

  if (!flare || flare.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [updated] = await db
    .update(matches)
    .set({ status })
    .where(eq(matches.id, id))
    .returning();

  return NextResponse.json(updated);
}
