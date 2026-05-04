import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, users } from "@/db/schema";
import { and, eq, gt, ilike, or } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const type = searchParams.get("type") || "all";

  if (!q || q.length === 0) {
    return NextResponse.json({ flares: [], users: [] });
  }

  const pattern = `%${q}%`;
  const result: { flares: unknown[]; users: unknown[] } = { flares: [], users: [] };

  if (type === "flares" || type === "all") {
    result.flares = await db
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
        latitude: flares.latitude,
        longitude: flares.longitude,
        maxSlots: flares.maxSlots,
        status: flares.status,
        expiresAt: flares.expiresAt,
        createdAt: flares.createdAt,
      })
      .from(flares)
      .innerJoin(users, eq(flares.userId, users.id))
      .where(
        and(
          eq(flares.status, "active"),
          gt(flares.expiresAt, new Date()),
          or(
            ilike(flares.activity, pattern),
            ilike(flares.description, pattern),
            ilike(flares.category, pattern)
          )
        )
      )
      .limit(20);
  }

  if (type === "users" || type === "all") {
    result.users = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        bio: users.bio,
        photoUrl: users.photoUrl,
      })
      .from(users)
      .where(
        or(
          ilike(users.name, pattern),
          ilike(users.bio, pattern)
        )
      )
      .limit(20);
  }

  return NextResponse.json(result);
}
