import { getAuth } from "firebase-admin/auth";

/**
 * Verify Firebase ID token from Authorization header.
 * Returns the authenticated user's UID, or null if invalid/missing.
 */
export async function verifyAuthToken(req: any): Promise<string | null> {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  try {
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch {
    return null;
  }
}

/**
 * Require authentication and optionally enforce that the authenticated user
 * matches the requested userId. Sends 401/403 and returns null on failure.
 * Returns the authenticated UID on success.
 */
export async function requireAuth(
  req: any,
  res: any,
  requestedUserId?: string
): Promise<string | null> {
  const uid = await verifyAuthToken(req);

  if (!uid) {
    res.status(401).json({ error: "Unauthorized: missing or invalid authentication token" });
    return null;
  }

  if (requestedUserId && requestedUserId !== uid) {
    res.status(403).json({ error: "Forbidden: cannot access another user's data" });
    return null;
  }

  return uid;
}
