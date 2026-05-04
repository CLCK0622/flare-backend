import { NextResponse } from "next/server";
import { db } from "@/db";
import { flares } from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";

export async function POST() {
  const now = new Date();

  const result = await db
    .update(flares)
    .set({ status: "expired" })
    .where(and(eq(flares.status, "active"), lt(flares.expiresAt, now)));

  return NextResponse.json({ expired: result.rowCount ?? 0 });
}
