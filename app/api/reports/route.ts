import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clampString } from "@/lib/validate";

const VALID_REASONS = ["spam", "harassment", "inappropriate", "fake", "other"];
const VALID_TARGET_TYPES = ["user", "flare"];

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`report:${user.id}`, 5, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const body = await request.json();
  const { targetType, targetId, reason, details } = body;

  if (!targetType || !VALID_TARGET_TYPES.includes(targetType)) {
    return NextResponse.json(
      { error: "targetType must be 'user' or 'flare'" },
      { status: 400 }
    );
  }

  if (!targetId) {
    return NextResponse.json(
      { error: "targetId is required" },
      { status: 400 }
    );
  }

  if (!reason || !VALID_REASONS.includes(reason)) {
    return NextResponse.json(
      { error: "reason must be one of: spam, harassment, inappropriate, fake, other" },
      { status: 400 }
    );
  }

  const [report] = await db
    .insert(reports)
    .values({
      reporterId: user.id,
      targetType,
      targetId,
      reason,
      details: details ? clampString(details, 1000) : "",
    })
    .returning();

  return NextResponse.json(report, { status: 201 });
}
