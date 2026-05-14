/**
 * exchangePipeline — Sprint 4 (F-BLOC2-P2).
 *
 * Single canonical helper for the `exchange_proposals` document shape.
 * Both `createExchangeProposal` and the medicine_request bridge
 * (acceptMedicineRequestOffer for `exchange` offers) must produce the
 * SAME contract consumed by `acceptExchangeProposal`,
 * `cancelExchangeProposal`, and `completeExchangeDelivery`.
 *
 * Sprint 4 decision lock #3: pas de duplication inline, pas de callable
 * vers callable. Toutes les écritures `exchange_proposals` doivent
 * passer par les helpers ci-dessous.
 *
 * Sprint 4 decision lock #5: la réservation d'inventaire suit strictement
 * le schéma existant. À l'acceptation, seul `details.exchangeInventoryItemId`
 * (l'item B fourni par la "requester pharmacy") est holdé :
 *   - `availableQuantity -= exchangeQuantity`
 *   - `reservedQuantity += exchangeQuantity`
 * L'item seller racine (`inventoryItemId`) est vérifié à l'accept mais
 * n'est PAS holdé : il est décrémenté à `completeExchangeDelivery`.
 *
 * Pure helpers : aucune lecture Firestore. Le caller passe les snapshots
 * qu'il a déjà lus dans sa transaction (Firestore exige toutes les
 * lectures avant le premier write).
 */

import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { citySlug } from "../cityUtils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CanonicalProposalType = "purchase" | "exchange";

export interface ProposalPharmacyInfo {
  uid: string;
  pharmacyName: string;
  address: string;
  city: string;
  cityCode: string;
  location: unknown;
  phoneNumber: string;
}

/**
 * `inventorySnapshot` stored alongside the canonical proposal — what the
 * proposals UI renders without re-reading `pharmacy_inventory`.
 */
export interface CanonicalInventorySnapshot {
  medicineId: string | null;
  medicineName: string | null;
  genericName?: string | null;
  strength?: string | null;
  form?: string | null;
  category?: string | null;
  packaging: string | null;
  lotNumber: string | null;
  expirationDate: unknown;
  availableQuantityAtOffer: number;
}

/**
 * The "exchangeItem" snapshot that lives inside `details.exchangeInventorySnapshot`
 * for exchange proposals. This is the requester pharmacy's item B that
 * gets back-office-transferred to the seller at `completeExchangeDelivery`.
 */
export interface CanonicalExchangeInventorySnapshot {
  medicineId: string;
  medicineName: string;
  dosage: string;
  form: string;
  packaging?: string | null;
  lotNumber?: string | null;
  expirationDate?: unknown;
  quantityAtAcceptance: number;
}

/**
 * Common details base shared by purchase and exchange proposals.
 *
 * `medicineName` / `medicineId` are denormalized into `details` because
 * downstream consumers (settlement, delivery generation, completion) read
 * from there and we do NOT want to add a live `pharmacy_inventory` read.
 */
export interface CanonicalProposalDetailsBase {
  type: CanonicalProposalType;
  /** Quantity of the seller's item A that flows from B → A (or B → buyer). */
  quantity: number;
  medicineName: string | null;
  medicineId: string | null;
  notes?: string;
}

export interface CanonicalPurchaseDetails extends CanonicalProposalDetailsBase {
  type: "purchase";
  unitPrice: number;
  totalPrice: number;
  currency: string;
}

export interface CanonicalExchangeDetails extends CanonicalProposalDetailsBase {
  type: "exchange";
  /** Requester's inventory item ID — held at accept time. */
  exchangeInventoryItemId: string;
  exchangeMedicineId: string;
  exchangeQuantity: number;
  /** Snapshot of the requester's exchange item captured at acceptance. */
  exchangeInventorySnapshot: CanonicalExchangeInventorySnapshot;
}

export type CanonicalProposalDetails =
  | CanonicalPurchaseDetails
  | CanonicalExchangeDetails;

/**
 * Reservations attached to the canonical proposal.
 * `walletReserved` is populated for `purchase`, `inventoryReserved` for
 * `exchange`. Both fields exist on the doc so consumers like
 * `completeExchangeDelivery` can branch off `details.type` without nil
 * worries on the off branch.
 */
export interface CanonicalProposalReservations {
  walletReserved: number | null;
  inventoryReserved: number | null;
}

/**
 * Inputs for `buildCanonicalProposalDocument`. Most fields are common to
 * both types; the discriminated `details` carries the type-specific shape.
 */
export interface BuildProposalInput {
  proposalId: string;
  inventoryItemId: string;
  fromPharmacyId: string;
  toPharmacyId: string;
  details: CanonicalProposalDetails;
  /** Initial status — `pending` for createExchangeProposal, `accepted` for
   * the medicine_request bridge (which jumps straight to accepted because
   * the seller already agreed by submitting the offer). */
  initialStatus: "pending" | "accepted";
  inventorySnapshot: CanonicalInventorySnapshot;
  /** Used to set `acceptedBy` + `acceptedAt` when initialStatus === "accepted". */
  acceptedBy?: string;
  /** Optional source tracking (filled by the medicine_request bridge). */
  sourceRequestId?: string;
  sourceOfferId?: string;
}

export interface BuildDeliveryInput {
  proposalId: string;
  proposalDetails: CanonicalProposalDetails;
  pickupPharmacy: ProposalPharmacyInfo;
  dropoffPharmacy: ProposalPharmacyInfo;
  /** Item shipped from pickup to dropoff (seller item A). */
  shippedItem: {
    medicineId: string;
    medicineName: string;
    dosage: string;
    form: string;
    quantity: number;
    packaging: string;
  };
  /** Courier fee in minor / major units, depending on legacy convention.
   *  Sprint 4 lock #6: no money refactor — caller computes as today. */
  courierFee: number;
}

// ---------------------------------------------------------------------------
// Validation helpers — pure (no Firestore reads)
// ---------------------------------------------------------------------------

/** Strictly one of `'purchase' | 'exchange'`. Anything else → throws
 *  `invalid-argument`. Used by request creation + offer submission. */
export function assertCanonicalMode(
  mode: unknown,
  fieldLabel: string
): CanonicalProposalType {
  if (mode === "purchase" || mode === "exchange") return mode;
  throw new HttpsError(
    "invalid-argument",
    `${fieldLabel} must be 'purchase' or 'exchange'.`
  );
}

/** Strict equality `offerType === request.requestMode`. */
export function assertOfferMatchesRequest(
  offerType: CanonicalProposalType,
  requestMode: CanonicalProposalType
): void {
  if (offerType !== requestMode) {
    throw new HttpsError(
      "failed-precondition",
      `Offer type '${offerType}' does not match request mode '${requestMode}'.`
    );
  }
}

/**
 * Shape validation for the `exchangeItem` field carried on an exchange
 * offer. Throws `invalid-argument` on any missing/invalid field.
 *
 * Sprint 4 lock #1: `exchangeItem` describes what the seller wants in
 * return from the requester. It is NOT an inventory reference at submit
 * time — the seller may not even know which lot the requester will pick.
 * Lock #7: snapshotting at submit time is forbidden; the actual snapshot
 * is captured at acceptance from the requester-picked
 * `exchangeInventoryItemId`.
 */
export interface ExchangeItemInput {
  medicineId: string;
  medicineName: string;
  dosage: string;
  form: string;
  quantity: number;
  expiryDate?: string | null;
  lotNumber?: string | null;
}

export function validateExchangeItemInput(value: unknown): ExchangeItemInput {
  if (!value || typeof value !== "object") {
    throw new HttpsError(
      "invalid-argument",
      "exchangeItem is required for exchange offers."
    );
  }
  const obj = value as Record<string, unknown>;
  const requireString = (key: string): string => {
    const v = obj[key];
    if (typeof v !== "string" || v.trim().length === 0) {
      throw new HttpsError(
        "invalid-argument",
        `exchangeItem.${key} is required and must be a non-empty string.`
      );
    }
    return v.trim();
  };
  const medicineId = requireString("medicineId");
  const medicineName = requireString("medicineName");
  const dosage = requireString("dosage");
  const form = requireString("form");
  const quantity = obj.quantity;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw new HttpsError(
      "invalid-argument",
      "exchangeItem.quantity must be a positive number."
    );
  }
  const expiryRaw = obj.expiryDate;
  const lotRaw = obj.lotNumber;
  return {
    medicineId,
    medicineName,
    dosage,
    form,
    quantity,
    expiryDate:
      typeof expiryRaw === "string" && expiryRaw.length > 0 ? expiryRaw : null,
    lotNumber:
      typeof lotRaw === "string" && lotRaw.length > 0 ? lotRaw : null,
  };
}

// ---------------------------------------------------------------------------
// Inventory hold helpers (Sprint 4 lock #5 — single-side reservation)
// ---------------------------------------------------------------------------

export interface ReserveExchangeInventoryParams {
  /** Snapshot read inside the same transaction. Must already have happened. */
  inventorySnap: FirebaseFirestore.DocumentSnapshot;
  /** UID that must own the inventory item. */
  expectedOwnerUid: string;
  /** Medicine ID the inventory must match. Always enforced. */
  expectedMedicineId: string;
  /** Dosage the inventory must match (case-insensitive trim). When `undefined`
   *  or empty string the dosage check is skipped — used by the legacy
   *  `createExchangeProposal` path whose input contract does not carry
   *  dosage on the exchange leg. The medicine-request bridge always
   *  supplies a non-empty value. */
  expectedDosage?: string;
  /** Form the inventory must match (case-insensitive trim). Same skip
   *  semantics as `expectedDosage`. */
  expectedForm?: string;
  /** Quantity to hold. */
  requiredQuantity: number;
  /** Now — used for expiry check. */
  now: Date;
}

export interface ReserveExchangeInventoryResult {
  data: FirebaseFirestore.DocumentData;
  snapshot: CanonicalExchangeInventorySnapshot;
}

function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Validates ownership / medicine / dosage / form / quantity / expiry on the
 * provided inventory snapshot, then issues the canonical hold write on
 * the transaction:
 *   `availableQuantity -= requiredQuantity`
 *   `reservedQuantity += requiredQuantity`
 *
 * Returns the inventory `data()` and the canonical snapshot that the
 * caller will embed in `details.exchangeInventorySnapshot`.
 *
 * Throws appropriate `HttpsError` codes on any validation failure.
 */
export function reserveExchangeInventory(
  transaction: Transaction,
  params: ReserveExchangeInventoryParams
): ReserveExchangeInventoryResult {
  const {
    inventorySnap,
    expectedOwnerUid,
    expectedMedicineId,
    expectedDosage,
    expectedForm,
    requiredQuantity,
    now,
  } = params;

  if (!inventorySnap.exists) {
    throw new HttpsError(
      "not-found",
      "Exchange inventory item not found."
    );
  }
  const data = inventorySnap.data()!;
  if ((data.pharmacyId as string) !== expectedOwnerUid) {
    throw new HttpsError(
      "permission-denied",
      "Exchange inventory item does not belong to the requester."
    );
  }

  const invMedicineId = (data.medicineId as string) || "";
  if (invMedicineId !== expectedMedicineId) {
    throw new HttpsError(
      "failed-precondition",
      "Exchange inventory does not match the seller's requested medicine."
    );
  }

  const invDosage =
    (data.medicineDosage as string) ||
    (data.dosage as string) ||
    (data.medicine?.strength as string) ||
    "";
  const invForm =
    (data.medicineForm as string) ||
    (data.form as string) ||
    (data.medicine?.form as string) ||
    "";
  if (
    typeof expectedDosage === "string" &&
    expectedDosage.length > 0 &&
    normalizeForMatch(invDosage) !== normalizeForMatch(expectedDosage)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Exchange inventory dosage does not match the requested item."
    );
  }
  if (
    typeof expectedForm === "string" &&
    expectedForm.length > 0 &&
    normalizeForMatch(invForm) !== normalizeForMatch(expectedForm)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Exchange inventory form does not match the requested item."
    );
  }

  const available = (data.availableQuantity as number) || 0;
  if (available < requiredQuantity) {
    throw new HttpsError(
      "failed-precondition",
      `Insufficient stock on exchange inventory. Available: ${available}, required: ${requiredQuantity}.`
    );
  }

  const expDate = data.batch?.expirationDate?.toDate?.();
  if (expDate && expDate < now) {
    throw new HttpsError(
      "failed-precondition",
      "Exchange inventory item has expired."
    );
  }

  transaction.update(inventorySnap.ref, {
    availableQuantity: FieldValue.increment(-requiredQuantity),
    reservedQuantity: FieldValue.increment(requiredQuantity),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const snapshot: CanonicalExchangeInventorySnapshot = {
    medicineId: invMedicineId,
    medicineName:
      (data.medicineName as string) || (data.medicine?.name as string) || "",
    dosage: invDosage,
    form: invForm,
    packaging: (data.packaging as string) || null,
    lotNumber:
      (data.batch?.lotNumber as string) ||
      (data.batchNumber as string) ||
      null,
    expirationDate: data.batch?.expirationDate ?? null,
    quantityAtAcceptance: available,
  };

  return { data, snapshot };
}

// ---------------------------------------------------------------------------
// Canonical document builders — pure (no Firestore reads or writes)
// ---------------------------------------------------------------------------

/**
 * Builds the canonical `exchange_proposals/{id}` document map.
 *
 * Fields downstream consumers rely on:
 *   - `details.type` (purchase | exchange)
 *   - `details.quantity` (seller item A units shipped to buyer)
 *   - `details.exchangeInventoryItemId` + `details.exchangeQuantity` (exchange only)
 *   - `details.exchangeInventorySnapshot` (exchange only — snapshot of item B)
 *   - `reservations.walletReserved` (purchase only)
 *   - `reservations.inventoryReserved` (exchange only)
 *   - `inventorySnapshot` (seller item A snapshot for UI)
 *   - `fromPharmacyId` (buyer / requester)
 *   - `toPharmacyId` (seller / inventory owner)
 */
export function buildCanonicalProposalDocument(
  input: BuildProposalInput,
  now: FieldValue
): Record<string, unknown> {
  const reservations: CanonicalProposalReservations =
    input.details.type === "purchase"
      ? {
          walletReserved: input.details.totalPrice,
          inventoryReserved: null,
        }
      : {
          walletReserved: null,
          inventoryReserved: input.details.exchangeQuantity,
        };

  const doc: Record<string, unknown> = {
    id: input.proposalId,
    inventoryItemId: input.inventoryItemId,
    fromPharmacyId: input.fromPharmacyId,
    toPharmacyId: input.toPharmacyId,
    details: { ...input.details },
    status: input.initialStatus,
    reservations,
    inventorySnapshot: input.inventorySnapshot,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  };

  if (input.initialStatus === "accepted") {
    if (!input.acceptedBy) {
      throw new HttpsError(
        "internal",
        "buildCanonicalProposalDocument: acceptedBy required when initialStatus='accepted'."
      );
    }
    doc.acceptedBy = input.acceptedBy;
    doc.acceptedAt = now;
    doc.acceptanceNotes = "";
  }

  if (input.sourceRequestId) {
    doc._sourceRequestId = input.sourceRequestId;
  }
  if (input.sourceOfferId) {
    doc._sourceOfferId = input.sourceOfferId;
  }

  return doc;
}

/**
 * Builds the canonical `deliveries/{id}` document map. The shape mirrors
 * what `acceptExchangeProposal` and the legacy `requestProposalBridge`
 * already produce so consumers (courier app, completeExchangeDelivery)
 * keep working unchanged.
 */
export function buildCanonicalDeliveryDocument(
  deliveryId: string,
  input: BuildDeliveryInput,
  now: FieldValue
): Record<string, unknown> {
  const isPurchase = input.proposalDetails.type === "purchase";
  const totalPrice = isPurchase
    ? (input.proposalDetails as CanonicalPurchaseDetails).totalPrice
    : 0;
  const currency = isPurchase
    ? (input.proposalDetails as CanonicalPurchaseDetails).currency
    : "";

  return {
    deliveryId,
    proposalId: input.proposalId,
    exchangeId: null,
    fromPharmacyId: input.pickupPharmacy.uid,
    fromPharmacyName: input.pickupPharmacy.pharmacyName,
    fromPharmacyAddress: input.pickupPharmacy.address,
    fromPharmacyCity: input.pickupPharmacy.city,
    fromPharmacyCityCode:
      input.pickupPharmacy.cityCode || citySlug(input.pickupPharmacy.city || ""),
    fromPharmacyLocation: input.pickupPharmacy.location || null,
    fromPharmacyPhone: input.pickupPharmacy.phoneNumber,
    toPharmacyId: input.dropoffPharmacy.uid,
    toPharmacyName: input.dropoffPharmacy.pharmacyName,
    toPharmacyAddress: input.dropoffPharmacy.address,
    toPharmacyCity: input.dropoffPharmacy.city,
    toPharmacyCityCode:
      input.dropoffPharmacy.cityCode || citySlug(input.dropoffPharmacy.city || ""),
    toPharmacyLocation: input.dropoffPharmacy.location || null,
    toPharmacyPhone: input.dropoffPharmacy.phoneNumber,
    items: [input.shippedItem],
    city: input.pickupPharmacy.city || input.dropoffPharmacy.city || "",
    cityCode:
      input.pickupPharmacy.cityCode ||
      input.dropoffPharmacy.cityCode ||
      citySlug(input.pickupPharmacy.city || input.dropoffPharmacy.city || ""),
    status: "pending",
    courierId: null,
    courierName: null,
    courierPhone: null,
    proposalType: input.proposalDetails.type,
    totalPrice,
    currency,
    courierFee: input.courierFee,
    paymentStatus: isPurchase ? "pending" : "n/a",
    createdAt: now,
    updatedAt: now,
    acceptedAt: now,
    assignedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    estimatedDeliveryTime: null,
    actualDeliveryTime: null,
    qrCodePickup: deliveryId,
    qrCodeDelivery: `${deliveryId}-delivery`,
    photoProofUrl: null,
    deliveryNotes: "",
  };
}

// ---------------------------------------------------------------------------
// Courier fee resolution — Sprint 4 (Finding 1 fix)
// ---------------------------------------------------------------------------

/**
 * Pure resolver that mirrors the formula used by `acceptExchangeProposal`.
 *
 *  Per-city config lives at `system_config/main.citiesByCountry[country][city]`
 *  with optional `deliveryFee` and `exchangeFee` keys.
 *
 *  Resolution :
 *   - `purchase` → `cityCfg.deliveryFee` if finite and > 0, otherwise fall
 *     back to 12% of `totalPrice` (legacy markets without per-city config).
 *   - `exchange` → `cityCfg.exchangeFee` if finite and > 0, otherwise
 *     `cityCfg.deliveryFee × 1.2` (exchange = one courier trip + a
 *     back-office stock transfer at completion), otherwise the legacy
 *     12% × totalPrice fallback (which equals 0 for medicine-request
 *     barter where totalPrice is 0 — that's the explicit no-config
 *     posture).
 *
 *  Sprint 4 Finding 1 fix : centralizes this formula so both
 *  `acceptExchangeProposal` and the medicine-request exchange bridge
 *  produce the SAME courier-fee number for a given city. Lock #6 says
 *  "50/50 préservé, aucune modification" — having both producers agree
 *  on the resolved fee preserves the 50/50 split end-to-end.
 *
 *  Returns 0 only when neither per-city config nor a positive totalPrice
 *  is available, which is the legitimate "market not configured" case.
 */
export interface ResolveCourierFeeInput {
  proposalType: CanonicalProposalType;
  /** `totalPrice` of the proposal (purchase) or 0 (exchange/barter). */
  totalPrice: number;
  /** ISO country code, e.g. "CM". */
  countryCode: string;
  /** City slug, e.g. "douala". */
  cityCode: string;
  /** Raw `system_config/main` snapshot data (already read by caller). */
  systemConfigData: FirebaseFirestore.DocumentData | undefined;
}

export function resolveCourierFee(input: ResolveCourierFeeInput): number {
  const { proposalType, totalPrice, countryCode, cityCode, systemConfigData } =
    input;
  try {
    const cfg = systemConfigData ?? {};
    const cities = (cfg.citiesByCountry as Record<string, unknown>) ?? {};
    const cityCfgRaw = (cities[countryCode] as Record<string, unknown>)?.[
      cityCode
    ] as Record<string, unknown> | undefined;
    const baseFee = Number(cityCfgRaw?.deliveryFee);
    const explicitExchangeFee = Number(cityCfgRaw?.exchangeFee);

    let fee = 0;
    if (proposalType === "purchase" && Number.isFinite(baseFee) && baseFee > 0) {
      fee = Math.round(baseFee);
    } else if (proposalType === "exchange") {
      if (Number.isFinite(explicitExchangeFee) && explicitExchangeFee > 0) {
        fee = Math.round(explicitExchangeFee);
      } else if (Number.isFinite(baseFee) && baseFee > 0) {
        fee = Math.round(baseFee * 1.2);
      }
    }
    if (fee === 0 && totalPrice > 0) {
      fee = Math.round(totalPrice * 0.12);
    }
    return fee;
  } catch {
    return totalPrice > 0 ? Math.round(totalPrice * 0.12) : 0;
  }
}

// ---------------------------------------------------------------------------
// Pharmacy info adapter
// ---------------------------------------------------------------------------

/**
 * Adapts a raw `pharmacies/{uid}` Firestore document data into the
 * `ProposalPharmacyInfo` shape consumed by the delivery builder.
 * Centralized so the same fallback chain (`pharmacyName | name | displayName`)
 * is used by every caller.
 */
export function pharmacyInfoFromDoc(
  uid: string,
  data: FirebaseFirestore.DocumentData | undefined
): ProposalPharmacyInfo {
  const d = data ?? {};
  return {
    uid,
    pharmacyName:
      (d.pharmacyName as string) ||
      (d.name as string) ||
      (d.displayName as string) ||
      "Unknown Pharmacy",
    address: (d.address as string) || "",
    city: (d.city as string) || "",
    cityCode: (d.cityCode as string) || citySlug((d.city as string) || ""),
    location: d.location || null,
    phoneNumber: (d.phoneNumber as string) || "",
  };
}
