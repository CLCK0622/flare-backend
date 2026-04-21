import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, matches, messages, users } from "@/db/schema";
import { eq, and, or, gt, lte, desc, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

// GET /api/matches?status=accepted&is_past=false
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const isPast = searchParams.get("is_past");

  const now = new Date();

  const conditions = [
    or(eq(matches.responderId, user.id), eq(flares.userId, user.id)),
  ];

  if (status) {
    conditions.push(eq(matches.status, status));
  }

  if (isPast === "true") {
    conditions.push(lte(flares.expiresAt, now));
  } else if (isPast === "false") {
    conditions.push(gt(flares.expiresAt, now));
  }

  // Subquery for latest message per match
  const lastMsg = db
    .select({
      matchId: messages.matchId,
      text: sql<string>`(array_agg(${messages.text} ORDER BY ${messages.sentAt} DESC))[1]`.as(
        "last_text"
      ),
      sentAt:
        sql<Date>`(array_agg(${messages.sentAt} ORDER BY ${messages.sentAt} DESC))[1]`.as(
          "last_sent"
        ),
    })
    .from(messages)
    .groupBy(messages.matchId)
    .as("last_msg");

  const results = await db
    .select({
      id: matches.id,
      flareId: matches.flareId,
      responderId: matches.responderId,
      responderName: users.name,
      flareActivity: flares.activity,
      // Extra flare fields so the responder's client can detect edits and
      // decide whether to surface an "updated" notification without an N+1
      // fetch per match.
      flareTimeLabel: flares.timeLabel,
      flareLocationName: flares.locationName,
      status: matches.status,
      chatExpiresAt: matches.chatExpiresAt,
      createdAt: matches.createdAt,
      flareExpiresAt: flares.expiresAt,
      flareUserId: flares.userId,
      lastMessage: lastMsg.text,
      lastMessageAt: lastMsg.sentAt,
    })
    .from(matches)
    .innerJoin(flares, eq(matches.flareId, flares.id))
    .innerJoin(users, eq(matches.responderId, users.id))
    .leftJoin(lastMsg, eq(matches.id, lastMsg.matchId))
    .where(and(...conditions))
    .orderBy(desc(matches.createdAt));

  return NextResponse.json(results);
}
