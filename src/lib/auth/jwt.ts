import jwt from "jsonwebtoken";
import { getEnv } from "@/lib/env";

export type SessionClaims = {
  sub: string;
  email?: string;
  role: string;
};

export function signSessionToken(claims: SessionClaims) {
  return jwt.sign(claims, getEnv().JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "7d"
  });
}

export function verifySessionToken(token: string): SessionClaims {
  const decoded = jwt.verify(token, getEnv().JWT_SECRET, { algorithms: ["HS256"] });
  return decoded as SessionClaims;
}

