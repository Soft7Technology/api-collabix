import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

const AccessTokenSecret = config.JWT_ACCESS_SECRET;
const RefreshTokenSecret = config.JWT_REFRESH_SECRET;
const AccessTokenExpiresIn = config.JWT_ACCESS_EXPIRES_IN;
const RefreshTokenExpiresIn = config.JWT_REFRESH_EXPIRES_IN;

/**
 * Hash a password using bcryptjs with 12 rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
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
    expiresIn: AccessTokenExpiresIn as any,
  });
}

/**
 * Generate a JWT Refresh Token.
 */
export function generateRefreshToken(payload: object): string {
  return jwt.sign(payload, RefreshTokenSecret, {
    expiresIn: RefreshTokenExpiresIn as any,
  });
}

/**
 * Verify a JWT Access Token. Returns the payload if valid, else null.
 */
export function verifyAccessToken(token: string): any {
  try {
    return jwt.verify(token, AccessTokenSecret);
  } catch (error) {
    return null;
  }
}

/**
 * Verify a JWT Refresh Token. Returns the payload if valid, else null.
 */
export function verifyRefreshToken(token: string): any {
  try {
    return jwt.verify(token, RefreshTokenSecret);
  } catch (error) {
    return null;
  }
}
