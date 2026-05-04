import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { follows, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// GET /api/follows?type=followers|following&userId=xxx
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const userId = searchParams.get("userId") || user.id;

  if (type !== "followers" && type !== "following") {
    return NextResponse.json(
      { error: "type must be 'followers' or 'following'" },
      { status: 400 }
    );
  }

  if (type === "followers") {
    const results = await db
      .select({
        id: follows.id,
        followerId: follows.followerId,
        followerName: users.name,
        followerPhoto: users.photoUrl,
        createdAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(follows.followerId, users.id))
      .where(eq(follows.followeeId, userId));

    return NextResponse.json(results);
  }

  // type === "following"
  const results = await db
    .select({
      id: follows.id,
      followeeId: follows.followeeId,
      followeeName: users.name,
      followeePhoto: users.photoUrl,
      createdAt: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(follows.followeeId, users.id))
    .where(eq(follows.followerId, userId));

  return NextResponse.json(results);
}

// POST /api/follows — follow a user
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`follows:${user.id}`, 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const { followeeId } = await request.json();

  if (!followeeId) {
    return NextResponse.json(
      { error: "followeeId is required" },
      { status: 400 }
    );
  }

  if (followeeId === user.id) {
    return NextResponse.json(
      { error: "You cannot follow yourself" },
      { status: 400 }
    );
  }

  // Verify the target user exists
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, followeeId))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [follow] = await db
    .insert(follows)
    .values({ followerId: user.id, followeeId })
    .onConflictDoNothing({
      target: [follows.followerId, follows.followeeId],
    })
    .returning();

  if (!follow) {
    return NextResponse.json(
      { error: "Already following this user" },
      { status: 409 }
    );
  }

  return NextResponse.json(follow, { status: 201 });
}

// DELETE /api/follows — unfollow a user
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { followeeId } = await request.json();

  if (!followeeId) {
    return NextResponse.json(
      { error: "followeeId is required" },
      { status: 400 }
    );
  }

  const deleted = await db
    .delete(follows)
    .where(
      and(eq(follows.followerId, user.id), eq(follows.followeeId, followeeId))
    )
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Follow relationship not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
