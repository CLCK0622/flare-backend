import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signToken } from "@/lib/auth";

// Dev-only endpoint: creates or finds a user by name and returns a JWT.
// Do NOT expose in production.
export async function POST(request: NextRequest) {
  try {
    const { name, bio, location } = await request.json();
    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.name, name))
      .limit(1);

    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          name,
          bio: bio || "",
          locationLabel: location || "Champaign, IL",
          activityInterests: ["Sports", "Food", "Casual"],
        })
        .returning();
    }

    const token = await signToken(user.id);

    return NextResponse.json({ token, user });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("dev auth error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
