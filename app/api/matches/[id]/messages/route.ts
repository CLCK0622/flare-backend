import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matches, messages, flares } from "@/db/schema";
import { eq, and, gt, asc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// GET /api/matches/:id/messages?after=2024-01-01T00:00:00Z
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: matchId } = await params;

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Verify user is participant
  const [flare] = await db
    .select()
    .from(flares)
    .where(eq(flares.id, match.flareId))
    .limit(1);

  if (
    match.responderId !== user.id &&
    flare?.userId !== user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check chat expiry
  if (match.chatExpiresAt && match.chatExpiresAt < new Date()) {
    return NextResponse.json({ error: "Chat has expired" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const after = searchParams.get("after");

  const conditions = [eq(messages.matchId, matchId)];
  if (after) {
    conditions.push(gt(messages.sentAt, new Date(after)));
  }

  const results = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(asc(messages.sentAt));

  return NextResponse.json(results);
}

// POST /api/matches/:id/messages
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: matchId } = await params;

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Verify user is participant
  const [flare] = await db
    .select()
    .from(flares)
    .where(eq(flares.id, match.flareId))
    .limit(1);

  if (
    match.responderId !== user.id &&
    flare?.userId !== user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (match.status !== "accepted") {
    return NextResponse.json(
      { error: "Match must be accepted to chat" },
      { status: 400 }
    );
  }

  if (match.chatExpiresAt && match.chatExpiresAt < new Date()) {
    return NextResponse.json({ error: "Chat has expired" }, { status: 403 });
  }

  const rl = rateLimit(`msg:${user.id}`, 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const body = await request.json();
  const { text, imageUrl } = body;
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) {
    return NextResponse.json(
      { error: "text is required" },
      { status: 400 }
    );
  }
  if (trimmed.length > 2000) {
    return NextResponse.json(
      { error: "Message too long (max 2000 chars)" },
      { status: 400 }
    );
  }

  const clampedImageUrl =
    typeof imageUrl === "string" ? imageUrl.slice(0, 500) : "";

  const [message] = await db
    .insert(messages)
    .values({
      matchId,
      senderId: user.id,
      text: trimmed,
      imageUrl: clampedImageUrl,
    })
    .returning();

  return NextResponse.json(message, { status: 201 });
}
