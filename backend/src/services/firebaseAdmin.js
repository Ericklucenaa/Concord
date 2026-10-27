/**
 * Server-side verification of Firebase ID tokens for "Login with Google".
 *
 * Security: the backend NEVER trusts an email/uid sent in the request body.
 * The client must send the Firebase ID token; we verify its signature with
 * firebase-admin and read the identity straight from the verified claims.
 *
 * firebase-admin is loaded dynamically and only when Google login is attempted,
 * so the rest of the backend (and the test suite) does not require it.
 *
 * Configure with either:
 *   - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, or
 *   - GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON file.
 */

let adminApp = null;
let initTried = false;

export function isGoogleLoginConfigured() {
  return Boolean(
    (process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY) ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

async function getAdmin() {
  if (adminApp) return adminApp;
  if (initTried) return null;
  initTried = true;

  if (!isGoogleLoginConfigured()) return null;

  try {
    const mod = await import('firebase-admin');
    const admin = mod.default || mod;

    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      adminApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey
        })
      });
    } else {
      // Uses GOOGLE_APPLICATION_CREDENTIALS
      adminApp = admin.initializeApp();
    }
    return adminApp;
  } catch (err) {
    console.error('[security] firebase-admin init failed:', err.message);
    adminApp = null;
    return null;
  }
}

/**
 * Verifies a Firebase ID token. Returns the decoded claims, or null if the
 * token is invalid, expired, or Google login is not configured on the server.
 */
export async function verifyFirebaseIdToken(idToken) {
  if (!idToken) return null;
  const app = await getAdmin();
  if (!app) return null;
  try {
    const mod = await import('firebase-admin');
    const admin = mod.default || mod;
    return await admin.auth(app).verifyIdToken(idToken);
  } catch (err) {
    return null;
  }
}
