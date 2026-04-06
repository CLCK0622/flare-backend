import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

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

  const [updated] = await db
    .update(users)
    .set({
      ...(name !== undefined && { name }),
      ...(bio !== undefined && { bio }),
      ...(locationLabel !== undefined && { locationLabel }),
      ...(activityInterests !== undefined && { activityInterests }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  return NextResponse.json(updated);
}
