import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matches, flares, readReceipts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/chat/read — mark messages as read
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`chat-read:${user.id}`, 60, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const body = await request.json();
  const { matchId } = body;

  if (!matchId) {
    return NextResponse.json(
      { error: "matchId is required" },
      { status: 400 }
    );
  }

  // Verify the match exists and user is a participant
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const [flare] = await db
    .select({ userId: flares.userId })
    .from(flares)
    .where(eq(flares.id, match.flareId))
    .limit(1);

  if (match.responderId !== user.id && flare?.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [receipt] = await db
    .insert(readReceipts)
    .values({
      matchId,
      userId: user.id,
      lastReadAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [readReceipts.matchId, readReceipts.userId],
      set: { lastReadAt: new Date() },
    })
    .returning();

  return NextResponse.json(receipt);
}

// GET /api/chat/read?matchId=xxx — get read receipts for a match
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");

  if (!matchId) {
    return NextResponse.json(
      { error: "matchId query parameter is required" },
      { status: 400 }
    );
  }

  // Verify the match exists and user is a participant
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const [flare] = await db
    .select({ userId: flares.userId })
    .from(flares)
    .where(eq(flares.id, match.flareId))
    .limit(1);

  if (match.responderId !== user.id && flare?.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const receipts = await db
    .select()
    .from(readReceipts)
    .where(eq(readReceipts.matchId, matchId));

  return NextResponse.json(receipts);
}
