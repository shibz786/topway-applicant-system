import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended Argon2id parameters.
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hashValue: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(hashValue, password, ARGON2_OPTIONS);
  } catch {
    // Malformed/foreign hash (e.g. a stale bcrypt hash from the legacy
    // migration) — treat as a failed verification, never throw past here.
    return false;
  }
}
