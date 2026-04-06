import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      bio: users.bio,
      activityInterests: users.activityInterests,
      memberSince: users.memberSince,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}
