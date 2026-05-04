import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const VALID_VISIBILITY = ["public", "followers", "private"] as const;
const VALID_THEME = ["light", "dark", "system"] as const;

const DEFAULTS = {
  notifyMatches: true,
  notifyMessages: true,
  notifyFlareEdits: true,
  profileVisibility: "public" as const,
  theme: "system" as const,
};

// GET /api/settings — get current user's settings
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, user.id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ userId: user.id, ...DEFAULTS });
  }

  return NextResponse.json(row);
}

// PUT /api/settings — update settings
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`settings:${user.id}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const body = await request.json();

  // Validate profileVisibility if provided
  if (
    body.profileVisibility !== undefined &&
    !VALID_VISIBILITY.includes(body.profileVisibility)
  ) {
    return NextResponse.json(
      { error: `profileVisibility must be one of: ${VALID_VISIBILITY.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate theme if provided
  if (body.theme !== undefined && !VALID_THEME.includes(body.theme)) {
    return NextResponse.json(
      { error: `theme must be one of: ${VALID_THEME.join(", ")}` },
      { status: 400 }
    );
  }

  // Build the set of fields to upsert
  const values: Record<string, unknown> = { userId: user.id };
  const setFields: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof body.notifyMatches === "boolean") {
    values.notifyMatches = body.notifyMatches;
    setFields.notifyMatches = body.notifyMatches;
  }
  if (typeof body.notifyMessages === "boolean") {
    values.notifyMessages = body.notifyMessages;
    setFields.notifyMessages = body.notifyMessages;
  }
  if (typeof body.notifyFlareEdits === "boolean") {
    values.notifyFlareEdits = body.notifyFlareEdits;
    setFields.notifyFlareEdits = body.notifyFlareEdits;
  }
  if (body.profileVisibility !== undefined) {
    values.profileVisibility = body.profileVisibility;
    setFields.profileVisibility = body.profileVisibility;
  }
  if (body.theme !== undefined) {
    values.theme = body.theme;
    setFields.theme = body.theme;
  }

  const [row] = await db
    .insert(settings)
    .values(values as typeof settings.$inferInsert)
    .onConflictDoUpdate({
      target: settings.userId,
      set: setFields as Partial<typeof settings.$inferInsert>,
    })
    .returning();

  return NextResponse.json(row);
}
