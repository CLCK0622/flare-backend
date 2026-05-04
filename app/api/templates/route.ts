import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { templates } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validate";

// GET /api/templates — list current user's templates
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await db
    .select()
    .from(templates)
    .where(eq(templates.userId, user.id));

  return NextResponse.json(results);
}

// POST /api/templates — create a template
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`templates:${user.id}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const body = await request.json();
  const { label, category, description, timeframe, locationName } = body;

  const trimmedLabel = typeof label === "string" ? label.trim() : "";
  if (!trimmedLabel) {
    return NextResponse.json(
      { error: "label is required" },
      { status: 400 }
    );
  }

  const [template] = await db
    .insert(templates)
    .values({
      userId: user.id,
      label: clampString(trimmedLabel, 200),
      category: clampString(category, 50),
      description: clampString(description, 500),
      timeframe: clampString(timeframe, 20) || "NOW",
      locationName: clampString(locationName, 200),
    })
    .returning();

  return NextResponse.json(template, { status: 201 });
}

// DELETE /api/templates — delete a template (body: { id })
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    );
  }

  const deleted = await db
    .delete(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, user.id)))
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Template not found or not owned by you" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
