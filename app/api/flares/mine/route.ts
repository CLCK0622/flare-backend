import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await db
    .select()
    .from(flares)
    .where(eq(flares.userId, user.id))
    .orderBy(desc(flares.createdAt));

  return NextResponse.json(results);
}
