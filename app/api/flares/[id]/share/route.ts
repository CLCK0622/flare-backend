import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flares, users } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/flares/:id/share
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [result] = await db
    .select({
      activity: flares.activity,
      userName: users.name,
      category: flares.category,
      timeLabel: flares.timeLabel,
    })
    .from(flares)
    .innerJoin(users, eq(flares.userId, users.id))
    .where(eq(flares.id, id))
    .limit(1);

  if (!result) {
    return NextResponse.json({ error: "Flare not found" }, { status: 404 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sendaflare.app";

  return NextResponse.json({
    url: `${baseUrl}/flare/${id}`,
    text: `Check out this flare: "${result.activity}" by ${result.userName} on Flare!`,
  });
}
