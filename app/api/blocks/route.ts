import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blocks, follows, users } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// GET /api/blocks — list blocked users
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await db
    .select({
      id: blocks.id,
      blockedId: blocks.blockedId,
      blockedName: users.name,
      blockedPhoto: users.photoUrl,
      createdAt: blocks.createdAt,
    })
    .from(blocks)
    .innerJoin(users, eq(blocks.blockedId, users.id))
    .where(eq(blocks.blockerId, user.id));

  return NextResponse.json(results);
}

// POST /api/blocks — block a user
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`blocks:${user.id}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const { blockedId } = await request.json();

  if (!blockedId) {
    return NextResponse.json(
      { error: "blockedId is required" },
      { status: 400 }
    );
  }

  if (blockedId === user.id) {
    return NextResponse.json(
      { error: "You cannot block yourself" },
      { status: 400 }
    );
  }

  // Verify the target user exists
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, blockedId))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Remove any follow relationships in both directions
  await db
    .delete(follows)
    .where(
      or(
        and(eq(follows.followerId, user.id), eq(follows.followeeId, blockedId)),
        and(eq(follows.followerId, blockedId), eq(follows.followeeId, user.id))
      )
    );

  const [block] = await db
    .insert(blocks)
    .values({ blockerId: user.id, blockedId })
    .onConflictDoNothing({
      target: [blocks.blockerId, blocks.blockedId],
    })
    .returning();

  if (!block) {
    return NextResponse.json(
      { error: "Already blocked this user" },
      { status: 409 }
    );
  }

  return NextResponse.json(block, { status: 201 });
}

// DELETE /api/blocks — unblock a user
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { blockedId } = await request.json();

  if (!blockedId) {
    return NextResponse.json(
      { error: "blockedId is required" },
      { status: 400 }
    );
  }

  const deleted = await db
    .delete(blocks)
    .where(
      and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, blockedId))
    )
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Block not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
