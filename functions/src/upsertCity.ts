/**
 * upsertCity — V2B
 *
 * Callable Firebase Function (onCall, v2) for admin users to create or
 * update a city in system_config/main → citiesByCountry.{countryCode}.{cityCode}.
 *
 * Also handles activation/deactivation (soft delete) — no hard delete.
 *
 * Security:
 *   - Requires Firebase Auth.
 *   - Caller must be an active admin with `manage_pharmacies` permission
 *     (or super_admin).
 *   - Scoped admins can only manage cities within their countryScopes.
 *   - super_admin has global scope.
 *
 * Side effects:
 *   - Maintains countries.{countryCode}.defaultCityCode coherence:
 *     - If country has no defaultCityCode and an active city is added → set it.
 *     - If the default city is disabled → pick first active city by sortOrder, or ''.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface UpsertCityData {
  countryCode: string;
  cityCode: string;
  name: string;
  region?: string;
  enabled: boolean;
  isMajorCity?: boolean;
  deliveryFee: number;
  currencyCode: string;
  latitude: number;
  longitude: number;
  validationRadiusKm: number;
  sortOrder?: number;
}

const CITY_CODE_REGEX = /^[a-z][a-z0-9_-]{1,49}$/;
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

export const upsertCity = onCall<UpsertCityData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    // Guard 1: authenticated
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // Guard 2: validate input shape
    const data = request.data;
    if (!data.countryCode || typeof data.countryCode !== "string") {
      throw new HttpsError("invalid-argument", "countryCode is required.");
    }
    if (!COUNTRY_CODE_REGEX.test(data.countryCode)) {
      throw new HttpsError(
        "invalid-argument",
        "countryCode must be ISO 3166-1 alpha-2 uppercase (e.g. 'CM')."
      );
    }
    if (!data.cityCode || typeof data.cityCode !== "string") {
      throw new HttpsError("invalid-argument", "cityCode is required.");
    }
    if (!CITY_CODE_REGEX.test(data.cityCode)) {
      throw new HttpsError(
        "invalid-argument",
        "cityCode must be a lowercase slug (2-50 chars, e.g. 'douala')."
      );
    }
    if (!data.name || typeof data.name !== "string" || data.name.trim().length === 0) {
      throw new HttpsError("invalid-argument", "name is required and must be non-empty.");
    }
    if (typeof data.enabled !== "boolean") {
      throw new HttpsError("invalid-argument", "enabled must be a boolean.");
    }
    if (typeof data.deliveryFee !== "number" || data.deliveryFee < 0) {
      throw new HttpsError("invalid-argument", "deliveryFee must be a number >= 0.");
    }
    if (typeof data.validationRadiusKm !== "number" || data.validationRadiusKm <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "validationRadiusKm must be a number > 0."
      );
    }
    if (typeof data.latitude !== "number" || data.latitude < -90 || data.latitude > 90) {
      throw new HttpsError("invalid-argument", "latitude must be between -90 and 90.");
    }
    if (typeof data.longitude !== "number" || data.longitude < -180 || data.longitude > 180) {
      throw new HttpsError("invalid-argument", "longitude must be between -180 and 180.");
    }
    if (!data.currencyCode || typeof data.currencyCode !== "string") {
      throw new HttpsError("invalid-argument", "currencyCode is required.");
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

    // Guard 4: scope check for non-super_admin
    if (role !== "super_admin") {
      const countryScopes = (adminData.countryScopes as string[]) || [];
      if (countryScopes.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "Admin has no country scope configured. Contact super admin."
        );
      }
      if (!countryScopes.includes(data.countryCode)) {
        throw new HttpsError(
          "permission-denied",
          `Country '${data.countryCode}' is outside your scope.`
        );
      }
    }

    // Guard 5: verify country exists in system_config and currencyCode matches
    const configRef = db.collection("system_config").doc("main");
    const configSnap = await configRef.get();
    if (!configSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "System configuration not initialized."
      );
    }
    const configData = configSnap.data()!;
    const countries = (configData.countries as Record<string, any>) || {};
    const country = countries[data.countryCode];
    if (!country) {
      throw new HttpsError(
        "not-found",
        `Country '${data.countryCode}' not found in system config.`
      );
    }
    const expectedCurrency = country.defaultCurrencyCode as string;
    if (expectedCurrency && data.currencyCode !== expectedCurrency) {
      throw new HttpsError(
        "invalid-argument",
        `currencyCode must match country default '${expectedCurrency}'.`
      );
    }

    // Build city object
    const cityObj: Record<string, any> = {
      code: data.cityCode,
      name: data.name.trim(),
      region: (data.region ?? "").trim(),
      enabled: data.enabled,
      isMajorCity: data.isMajorCity ?? false,
      deliveryFee: data.deliveryFee,
      currencyCode: data.currencyCode,
      latitude: data.latitude,
      longitude: data.longitude,
      validationRadiusKm: data.validationRadiusKm,
      sortOrder: data.sortOrder ?? 0,
    };

    // Build update payload
    const updatePayload: Record<string, any> = {
      [`citiesByCountry.${data.countryCode}.${data.cityCode}`]: cityObj,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByAdminId: userId,
    };

    // Maintain defaultCityCode coherence
    const currentDefault = (country.defaultCityCode as string) || "";
    const citiesByCountry =
      (configData.citiesByCountry as Record<string, any>) || {};
    const countryCities =
      (citiesByCountry[data.countryCode] as Record<string, any>) || {};

    if (data.enabled && !currentDefault) {
      // Country has no default — set this city as default
      updatePayload[`countries.${data.countryCode}.defaultCityCode`] =
        data.cityCode;
      logger.info("upsertCity: setting defaultCityCode (no previous default)", {
        countryCode: data.countryCode,
        cityCode: data.cityCode,
      });
    } else if (!data.enabled && currentDefault === data.cityCode) {
      // Disabling the current default — find next active city by sortOrder
      const otherActive = Object.entries(countryCities)
        .filter(
          ([code, c]) =>
            code !== data.cityCode && (c as any).enabled === true
        )
        .sort(
          (a, b) =>
            ((a[1] as any).sortOrder ?? 0) - ((b[1] as any).sortOrder ?? 0)
        );
      const newDefault =
        otherActive.length > 0 ? (otherActive[0][0] as string) : "";
      updatePayload[`countries.${data.countryCode}.defaultCityCode`] =
        newDefault;
      logger.info("upsertCity: recalculated defaultCityCode after disable", {
        countryCode: data.countryCode,
        disabledCity: data.cityCode,
        newDefault,
      });
    }

    // Execute
    await configRef.update(updatePayload);

    logger.info("upsertCity: success", {
      countryCode: data.countryCode,
      cityCode: data.cityCode,
      enabled: data.enabled,
      adminUserId: userId,
    });

    return { success: true, countryCode: data.countryCode, cityCode: data.cityCode };
  }
);
