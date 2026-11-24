// RideIQ Authentication Manager
// JWT-based authentication. Supports local development and remote HTTP deployments.

import jwt, { type SignOptions } from 'jsonwebtoken';
import { getConfig } from '../config/index.js';
import { logger } from '../logging/index.js';
import { createError, ErrorCategory } from '../errors/index.js';

const { sign, verify, JsonWebTokenError, TokenExpiredError } = jwt;

export interface TokenPayload {
  sub: string; // user / actor id
  roles: string[];
  scopes: string[];
  iat?: number;
  exp?: number;
}

export function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  const config = getConfig();
  return sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: 'rideiq',
    audience: 'rideiq-mcp',
  });
}

export interface VerifyTokenResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
}

export function verifyToken(token: string): VerifyTokenResult {
  const config = getConfig();
  try {
    const decoded = verify(token, config.JWT_SECRET, {
      issuer: 'rideiq',
      audience: 'rideiq-mcp',
    }) as TokenPayload;
    if (
      typeof decoded.sub !== 'string' || decoded.sub.length === 0 ||
      !Array.isArray(decoded.roles) || !decoded.roles.every((role) => typeof role === 'string') ||
      !Array.isArray(decoded.scopes) || !decoded.scopes.every((scope) => typeof scope === 'string')
    ) return { valid: false, error: 'invalid_claims' };
    return { valid: true, payload: decoded };
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return { valid: false, error: 'token_expired' };
    }
    if (err instanceof JsonWebTokenError) {
      return { valid: false, error: 'invalid_token' };
    }
    logger.warn({ err }, 'Unexpected token verification error');
    return { valid: false, error: 'verification_failed' };
  }
}

export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }
  return null;
}

export function requireAuth(authHeader?: string): TokenPayload {
  const token = extractTokenFromHeader(authHeader);
  if (!token) {
    throw createError(ErrorCategory.AUTHENTICATION_REQUIRED, 'Authentication required');
  }
  const result = verifyToken(token);
  if (!result.valid || !result.payload) {
    throw createError(ErrorCategory.AUTHENTICATION_REQUIRED, result.error ?? 'Invalid token');
  }
  return result.payload;
}

export function hasRole(payload: TokenPayload, requiredRole: string): boolean {
  return payload.roles.includes(requiredRole) || payload.roles.includes('ADMIN');
}

export function hasAnyRole(payload: TokenPayload, requiredRoles: string[]): boolean {
  return requiredRoles.some((r) => hasRole(payload, r));
}
