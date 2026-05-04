import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reports, users, flares } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const conditions = status ? eq(reports.status, status) : undefined;

  const rows = await db
    .select({
      id: reports.id,
      reporterId: reports.reporterId,
      reporterName: users.name,
      targetType: reports.targetType,
      targetId: reports.targetId,
      reason: reports.reason,
      details: reports.details,
      status: reports.status,
      resolvedBy: reports.resolvedBy,
      resolvedAt: reports.resolvedAt,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .innerJoin(users, eq(reports.reporterId, users.id))
    .where(conditions)
    .orderBy(desc(reports.createdAt));

  return NextResponse.json(rows);
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { reportId, status, action } = body;

  if (!reportId || !status) {
    return NextResponse.json(
      { error: "reportId and status are required" },
      { status: 400 }
    );
  }

  const validStatuses = ["resolved", "dismissed"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: "Status must be 'resolved' or 'dismissed'" },
      { status: 400 }
    );
  }

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  await db
    .update(reports)
    .set({
      status,
      resolvedBy: user.id,
      resolvedAt: new Date(),
    })
    .where(eq(reports.id, reportId));

  if (action === "ban") {
    await db
      .update(users)
      .set({ role: "banned" })
      .where(eq(users.id, report.targetId));
  }

  if (action === "delete_flare") {
    await db
      .update(flares)
      .set({ status: "cancelled" })
      .where(eq(flares.id, report.targetId));
  }

  return NextResponse.json({ success: true });
}
