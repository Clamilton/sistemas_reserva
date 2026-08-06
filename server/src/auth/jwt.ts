import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET não configurado");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export interface SessionPayload {
  sub: string;
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId } satisfies SessionPayload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}
