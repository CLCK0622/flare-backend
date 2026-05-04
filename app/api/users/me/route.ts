import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { clampString } from "@/lib/validate";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(user);
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, bio, locationLabel, activityInterests } = body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (name !== undefined) {
    const trimmed = clampString(name, 100);
    if (trimmed.length === 0) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    updates.name = trimmed;
  }
  if (bio !== undefined) updates.bio = clampString(bio, 200);
  if (locationLabel !== undefined) updates.locationLabel = clampString(locationLabel, 200);
  if (activityInterests !== undefined) {
    if (!Array.isArray(activityInterests) || activityInterests.length > 20) {
      return NextResponse.json({ error: "activityInterests must be an array (max 20)" }, { status: 400 });
    }
    updates.activityInterests = activityInterests
      .filter((i: unknown) => typeof i === "string")
      .map((i: string) => i.slice(0, 50));
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.id))
    .returning();

  return NextResponse.json(updated);
}
