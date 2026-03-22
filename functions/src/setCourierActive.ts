/**
 * setCourierActive — V2C
 *
 * Callable Firebase Function (onCall, v2) for admin users to activate or
 * deactivate a courier.
 *
 * Security:
 *   - Requires Firebase Auth.
 *   - Caller must be an active admin with `manage_pharmacies` permission
 *     (or super_admin). V2C reuses the existing permission gate.
 *   - Scoped admins can only modify couriers within their countryScopes.
 *   - super_admin has global scope.
 *
 * The callable does NOT hard-delete — it toggles `isActive`.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface SetCourierActiveData {
  courierId: string;
  isActive: boolean;
}

export const setCourierActive = onCall<SetCourierActiveData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    // Guard 1: authenticated
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // Guard 2: validate input
    const { courierId, isActive } = request.data;
    if (!courierId || typeof courierId !== "string") {
      throw new HttpsError("invalid-argument", "courierId is required.");
    }
    if (typeof isActive !== "boolean") {
      throw new HttpsError("invalid-argument", "isActive must be a boolean.");
    }

    // Guard 3: verify admin exists, is active, has manage_pharmacies permission
    const adminRef = db.collection("admins").doc(userId);
    const adminSnap = await adminRef.get();
    if (!adminSnap.exists) {
      throw new HttpsError("permission-denied", "Admin profile not found.");
    }
    const adminData = adminSnap.data()!;
    if (adminData.isActive !== true) {
      throw new HttpsError("permission-denied", "Admin account is inactive.");
    }
    const role = adminData.role as string;
    const permissions = (adminData.permissions as string[]) || [];
    const canManage =
      role === "super_admin" || permissions.includes("manage_pharmacies");
    if (!canManage) {
      throw new HttpsError(
        "permission-denied",
        "manage_pharmacies permission required."
      );
    }

    // Guard 4: verify courier exists
    const courierRef = db.collection("couriers").doc(courierId);
    const courierSnap = await courierRef.get();
    if (!courierSnap.exists) {
      throw new HttpsError("not-found", "Courier not found.");
    }

    // Guard 5: scope check for non-super_admin.
    if (role !== "super_admin") {
      const countryScopes =
        (adminData.countryScopes as string[]) || [];
      if (countryScopes.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "Admin has no country scope configured. Contact super admin."
        );
      }
      const courierData = courierSnap.data()!;
      const courierCountry =
        (courierData.countryCode as string) || "";
      if (!courierCountry || !countryScopes.includes(courierCountry)) {
        throw new HttpsError(
          "permission-denied",
          "Courier is outside your country scope."
        );
      }
    }

    // Execute: toggle isActive
    await courierRef.update({
      isActive,
      updatedAt: FieldValue.serverTimestamp(),
      lastModifiedByAdminId: userId,
    });

    logger.info("setCourierActive: updated", {
      courierId,
      isActive,
      adminUserId: userId,
    });

    return { success: true, courierId, isActive };
  }
);
