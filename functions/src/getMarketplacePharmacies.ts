/**
 * Sprint 2B.2b — `getMarketplacePharmacies`
 *
 * Backend-owned marketplace listing. Returns only pharmacies that pass
 * the license gate (`licenseGate.ts` / Sprint 2A.3) for the requested
 * country. The Flutter clients no longer query `collection('pharmacies')`
 * directly for listing — they go through this callable. The
 * complementary `firestore.rules` change denies `allow list` on
 * `/pharmacies` so a modified client cannot bypass the filter.
 *
 * Authorization :
 *   - caller must be authenticated (no role required ; any pharmacy or
 *     courier user may discover other pharmacies in their country).
 *
 * Input :
 *   - `countryCode` (required, ISO 3166-1 alpha-2 uppercase).
 *   - `cityCode` (optional, slug) — when provided, results are further
 *     restricted to the same city.
 *
 * Eligibility (per pharmacy) :
 *   - The pharmacy's `licenseStatus` is evaluated by `evaluateLicenseGate`
 *     against the country config loaded from
 *     `system_config/main.countries[countryCode]`. Only `decision === 'allow'`
 *     pharmacies are returned. Hidden : `pending_verification`, `rejected`,
 *     `correction_needed`, `expired`, `grace_period` whose
 *     `licenseGraceEndsAt` is past.
 *
 * Fail-closed semantics :
 *   - Unknown country (absent from `system_config/main.countries`) → zero
 *     results, structured `logger.warn` so ops can detect a stale client
 *     payload. NEVER 5xx — the client must keep working.
 *   - `system_config/main` document absent → zero results + warn.
 *
 * Output safety :
 *   - The response NEVER includes `licenseStatus`, `licenseRejectionReason`,
 *     or any other field that would let a client distinguish "this
 *     pharmacy was filtered out for license reasons" from "this pharmacy
 *     does not exist." Only listing-safe identity / location fields are
 *     surfaced.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {
  evaluateLicenseGate,
  type CountryLicenseConfig,
  type CountryResolution,
  type PharmacyLicenseSnapshot,
} from "./lib/licenseGate.js";

const db = getFirestore();

const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

interface GetMarketplacePharmaciesInput {
  countryCode: string;
  cityCode?: string;
}

/** Listing-safe fields — keep this list strict. */
interface MarketplacePharmacyOutput {
  uid: string;
  pharmacyName: string;
  address: string;
  countryCode: string;
  cityCode?: string;
  city?: string;
  phoneNumber?: string;
  locationData?: Record<string, unknown>;
}

/**
 * Pure validator for the input — exported for unit testing.
 */
export function validateGetMarketplacePharmaciesInput(
  data: GetMarketplacePharmaciesInput
): void {
  if (!data.countryCode || typeof data.countryCode !== "string") {
    throw new HttpsError("invalid-argument", "countryCode is required.");
  }
  if (!COUNTRY_CODE_REGEX.test(data.countryCode)) {
    throw new HttpsError(
      "invalid-argument",
      "countryCode must be ISO 3166-1 alpha-2 uppercase (e.g. 'GH')."
    );
  }
  if (
    data.cityCode !== undefined &&
    (typeof data.cityCode !== "string" || data.cityCode.length === 0)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "cityCode, if provided, must be a non-empty slug."
    );
  }
}

/**
 * Pure listing-safe projector for a Firestore pharmacy document.
 * Strips every backend-controlled license field and any other key
 * not on the explicit listing-safe allow-list. Exported so unit tests
 * can assert the output shape against a regression vector.
 */
export function projectListingSafe(
  uid: string,
  data: Record<string, unknown>
): MarketplacePharmacyOutput {
  const safe: MarketplacePharmacyOutput = {
    uid,
    pharmacyName:
      typeof data.pharmacyName === "string" ? data.pharmacyName : "",
    address: typeof data.address === "string" ? data.address : "",
    countryCode:
      typeof data.countryCode === "string" ? data.countryCode : "",
  };
  if (typeof data.cityCode === "string") safe.cityCode = data.cityCode;
  if (typeof data.city === "string") safe.city = data.city;
  if (typeof data.phoneNumber === "string") safe.phoneNumber = data.phoneNumber;
  if (
    data.locationData !== undefined &&
    data.locationData !== null &&
    typeof data.locationData === "object" &&
    !Array.isArray(data.locationData)
  ) {
    safe.locationData = data.locationData as Record<string, unknown>;
  }
  return safe;
}

export const getMarketplacePharmacies = onCall<GetMarketplacePharmaciesInput>(
  { region: "europe-west1", cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const input = request.data ?? ({} as GetMarketplacePharmaciesInput);
    validateGetMarketplacePharmaciesInput(input);

    const { countryCode } = input;
    const cityCode = input.cityCode;

    // Load system_config/main.countries once for fail-closed gate evaluation.
    const sysConfigSnap = await db
      .collection("system_config")
      .doc("main")
      .get();

    let countryConfig: CountryLicenseConfig | null = null;
    if (sysConfigSnap.exists) {
      const sysConfigData = (sysConfigSnap.data() ?? {}) as {
        countries?: Record<string, CountryLicenseConfig | undefined>;
      };
      const countries = sysConfigData.countries;
      if (
        countries &&
        typeof countries === "object" &&
        countryCode in countries &&
        countries[countryCode] != null
      ) {
        countryConfig = countries[countryCode]!;
      }
    }

    if (countryConfig === null) {
      // Fail-closed : unknown / missing country config → zero results.
      // Could be (a) a stale client snapshot from before an admin added
      // the country to system_config, or (b) a payload mismatch.
      logger.warn("getMarketplacePharmacies: unknown country", {
        countryCode,
        callerUid: request.auth.uid,
      });
      return { pharmacies: [] as MarketplacePharmacyOutput[] };
    }

    // Query pharmacies for this country (+ optional city).
    let query = db
      .collection("pharmacies")
      .where("countryCode", "==", countryCode);
    if (typeof cityCode === "string" && cityCode.length > 0) {
      query = query.where("cityCode", "==", cityCode);
    }

    const pharmaciesSnap = await query.get();

    const now = new Date();
    const result: MarketplacePharmacyOutput[] = [];
    const resolution: CountryResolution = {
      status: "loaded",
      country: countryConfig,
    };

    for (const doc of pharmaciesSnap.docs) {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      const pharmacyForGate: PharmacyLicenseSnapshot = {
        countryCode: typeof data.countryCode === "string"
          ? (data.countryCode as string)
          : null,
        licenseStatus: typeof data.licenseStatus === "string"
          ? (data.licenseStatus as string)
          : null,
        licenseGraceEndsAt: (data.licenseGraceEndsAt ?? null) as
          | PharmacyLicenseSnapshot["licenseGraceEndsAt"],
      };
      const gate = evaluateLicenseGate(pharmacyForGate, resolution, now);
      if (gate.decision !== "allow") continue;

      result.push(projectListingSafe(doc.id, data));
    }

    return { pharmacies: result };
  }
);
