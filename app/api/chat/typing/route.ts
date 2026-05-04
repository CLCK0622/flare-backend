import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const TYPING_TTL = 5_000; // 5 seconds
const CLEANUP_INTERVAL = 30_000;

const typingState = new Map<
  string,
  { userId: string; userName: string; at: number }
>();

let lastCleanup = Date.now();

function cleanupExpired() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of typingState) {
    if (entry.at <= now - TYPING_TTL) typingState.delete(key);
  }
}

// POST /api/chat/typing — signal that the user is typing
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`typing:${user.id}`, 60, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const body = await request.json();
  const { matchId } = body;

  if (!matchId) {
    return NextResponse.json(
      { error: "matchId is required" },
      { status: 400 }
    );
  }

  const key = `${matchId}:${user.id}`;
  typingState.set(key, {
    userId: user.id,
    userName: user.name,
    at: Date.now(),
  });

  cleanupExpired();

  return NextResponse.json({ success: true });
}

// GET /api/chat/typing?matchId=xxx — get who is currently typing
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

  cleanupExpired();

  const now = Date.now();
  const typing: { userId: string; userName: string }[] = [];

  for (const [key, entry] of typingState) {
    if (
      key.startsWith(`${matchId}:`) &&
      entry.userId !== user.id &&
      entry.at > now - TYPING_TTL
    ) {
      typing.push({ userId: entry.userId, userName: entry.userName });
    }
  }

  return NextResponse.json(typing);
}
