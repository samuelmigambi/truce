import "server-only";

import { adminAuth } from "@/server/firebase";

/**
 * The few Firebase Authentication calls Truce makes, behind one small interface so the session
 * code reads plainly and tests can stand in for Firebase.
 */

export interface TokenClaims {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  /** When the person last signed in, in seconds. */
  auth_time: number;
  /** When this token or cookie was issued, in seconds. */
  iat: number;
}

export interface Identity {
  verifyIdToken(idToken: string): Promise<TokenClaims>;
  createSessionCookie(idToken: string, expiresInMs: number): Promise<string>;
  verifySessionCookie(cookie: string): Promise<TokenClaims>;
  revokeSessions(uid: string): Promise<void>;
  /** Firebase's own record of the account, for checking email verification. */
  getAccount(
    uid: string,
  ): Promise<{ email: string | null; emailVerified: boolean; name: string | null }>;
}

const claims = (decoded: Record<string, unknown> & { uid: string }): TokenClaims => ({
  uid: decoded.uid,
  email: typeof decoded.email === "string" ? decoded.email : undefined,
  email_verified: decoded.email_verified === true,
  name: typeof decoded.name === "string" ? decoded.name : undefined,
  auth_time: Number(decoded.auth_time) || 0,
  iat: Number(decoded.iat) || 0,
});

export const firebaseIdentity: Identity = {
  async verifyIdToken(idToken) {
    return claims(await (await adminAuth()).verifyIdToken(idToken));
  },
  async createSessionCookie(idToken, expiresInMs) {
    return (await adminAuth()).createSessionCookie(idToken, { expiresIn: expiresInMs });
  },
  async verifySessionCookie(cookie) {
    // Revocation is checked against the user's record in Truce's store, not with a round trip.
    return claims(await (await adminAuth()).verifySessionCookie(cookie, false));
  },
  async revokeSessions(uid) {
    await (await adminAuth()).revokeRefreshTokens(uid);
  },
  async getAccount(uid) {
    const record = await (await adminAuth()).getUser(uid);
    return {
      email: record.email ?? null,
      emailVerified: record.emailVerified,
      name: record.displayName ?? null,
    };
  },
};

let current: Identity = firebaseIdentity;

export function identity(): Identity {
  return current;
}

/** For tests: a stand-in for Firebase. Returns a function that puts Firebase back. */
export function replaceIdentity(stand: Identity): () => void {
  current = stand;
  return () => {
    current = firebaseIdentity;
  };
}
