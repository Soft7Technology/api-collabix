import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

const AccessTokenSecret = config.JWT_ACCESS_SECRET;
const RefreshTokenSecret = config.JWT_REFRESH_SECRET;
const AccessTokenExpiresIn = config.JWT_ACCESS_EXPIRES_IN;
const RefreshTokenExpiresIn = config.JWT_REFRESH_EXPIRES_IN;

const DURATION_REGEX = /^(\d+)(ms|s|m|h|d|w|y)$/i;

function assertValidDuration(value: string, name: string): void {
  if (!DURATION_REGEX.test(value)) {
    throw new Error(
      `Invalid duration format for ${name}: "${value}". Expected format like "15m", "4h", "30d".`,
    );
  }
}

assertValidDuration(AccessTokenExpiresIn, "JWT_ACCESS_EXPIRES_IN");
assertValidDuration(RefreshTokenExpiresIn, "JWT_REFRESH_EXPIRES_IN");

/**
 * Standard OWASP-recommended 10 salt rounds for bcryptjs.
 * Reduces CPU latency (~50ms) to mitigate CPU-exhaustion DoS while ensuring strong security.
 */
const BCRYPT_SALT_ROUNDS = 10;

/**
 * Hash a password using bcryptjs with 10 rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Compare a password against its bcrypt hash.
 */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT Access Token.
 */
export function generateAccessToken(payload: object): string {
  return jwt.sign(payload, AccessTokenSecret, {
    expiresIn: AccessTokenExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Generate a JWT Refresh Token.
 */
export function generateRefreshToken(payload: object): string {
  return jwt.sign(payload, RefreshTokenSecret, {
    expiresIn: RefreshTokenExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Verify a JWT Access Token. Returns the payload if valid, else null.
 */
export function verifyAccessToken(token: string): any {
  try {
    return jwt.verify(token, AccessTokenSecret);
  } catch {
    return null;
  }
}

/**
 * Verify a JWT Refresh Token. Returns the payload if valid, else null.
 */
export function verifyRefreshToken(token: string): any {
  try {
    return jwt.verify(token, RefreshTokenSecret);
  } catch {
    return null;
  }
}
