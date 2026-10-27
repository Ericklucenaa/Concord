import crypto from 'crypto';

let cachedSecret = null;

/**
 * Returns the JWT signing secret.
 *
 * Security: there is NO hardcoded fallback. In production a missing/empty
 * JWT_SECRET throws (the server refuses to start). In development/test, if none
 * is provided, an ephemeral random secret is generated for this process only —
 * sessions are invalidated on restart, which is safe and expected locally.
 */
export function getJwtSecret() {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.trim()) {
    cachedSecret = fromEnv.trim();
    return cachedSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is not set. Refusing to start in production without a secure secret. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  cachedSecret = crypto.randomBytes(48).toString('hex');
  console.warn(
    '[security] JWT_SECRET not set — generated an ephemeral development secret. ' +
    'Tokens are invalidated on each restart. Set JWT_SECRET for persistent sessions.'
  );
  return cachedSecret;
}

export function getJwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '7d';
}
