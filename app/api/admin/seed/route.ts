import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";

const ADMIN_EMAIL = "zhongyi070622@gmail.com";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin@070622";

export async function POST() {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.username, ADMIN_USERNAME))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, existing.id));

    return NextResponse.json({ message: "Admin role granted to existing user" });
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  await db.insert(users).values({
    name: "Admin",
    email: ADMIN_EMAIL,
    username: ADMIN_USERNAME,
    passwordHash,
    role: "admin",
  });

  return NextResponse.json({ message: "Admin account created" }, { status: 201 });
}
