import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-in-production-please"
);

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifyToken(
  token: string
): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { sub: string };
  } catch {
    return null;
  }
}

export async function getCurrentUser(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice(7);
  const payload = await verifyToken(token);
  if (!payload?.sub) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  return user ?? null;
}
