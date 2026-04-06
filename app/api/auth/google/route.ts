import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signToken } from "@/lib/auth";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function POST(request: NextRequest) {
  const { idToken } = await request.json();
  if (!idToken) {
    return NextResponse.json(
      { error: "idToken is required" },
      { status: 400 }
    );
  }

  let googleId: string;
  let name: string;

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) throw new Error("Invalid token");
    googleId = payload.sub;
    name = payload.given_name || payload.name || "User";
  } catch {
    return NextResponse.json(
      { error: "Invalid Google token" },
      { status: 401 }
    );
  }

  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.googleId, googleId))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({ googleId, name })
      .returning();
  }

  const token = await signToken(user.id);

  return NextResponse.json({ token, user });
}
