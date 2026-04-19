/**
 * 🔒 ACCEPT EXCHANGE PROPOSAL AND CREATE DELIVERY
 *
 * Firebase Cloud Function for target pharmacy accepting exchange proposals.
 * Creates delivery order and transitions wallet balance from held → deducted.
 *
 * Atomic Operations:
 * - Validate proposal status is "pending"
 * - Create delivery order document
 * - Update proposal status to "accepted"
 * - Move wallet balance: held → deducted (ready for payment capture)
 * - Link to existing exchangeCapture workflow
 *
 * Security:
 * - Only target pharmacy can accept proposal
 * - Only pending proposals can be accepted
 * - Atomic transaction prevents partial operations
 * - Server-side validation (cannot be bypassed)
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { citySlug } from "./cityUtils.js";

const db = getFirestore();

interface AcceptProposalData {
  proposalId: string;
  notes?: string; // Optional acceptance notes from target pharmacy
}

/**
 * Accepts an exchange proposal and creates delivery order
 *
 * @param {AcceptProposalData} data - Acceptance data
 * @returns {Promise<{success: boolean, proposalId: string, deliveryId: string}>}
 * @throws {HttpsError} - If validation fails
 */
export const acceptExchangeProposal = onCall<AcceptProposalData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;

    // 🔒 AUTHENTICATION CHECK
    if (!userId) {
      logger.warn("acceptExchangeProposal: Unauthenticated request");
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to accept proposals"
      );
    }

    const data = request.data;

    // 🔒 VALIDATE INPUT DATA
    if (!data || !data.proposalId) {
      throw new HttpsError("invalid-argument", "Proposal ID is required");
    }

    const { proposalId, notes } = data;

    logger.info(
      `acceptExchangeProposal: User ${userId} attempting to accept proposal ${proposalId}`,
      { notes }
    );

    // 🔒 ATOMIC TRANSACTION: Accept proposal + create delivery + update wallet
    const result = await db.runTransaction(async (transaction) => {
      // ===== PHASE 1: READ PROPOSAL =====

      const proposalRef = db.collection("exchange_proposals").doc(proposalId);
      const proposalSnapshot = await transaction.get(proposalRef);

      if (!proposalSnapshot.exists) {
        throw new HttpsError("not-found", "Proposal not found");
      }

      const proposal = proposalSnapshot.data();

      // ===== PHASE 2: VALIDATE AUTHORIZATION & STATUS =====

      // Verify user is the TARGET pharmacy (only target can accept)
      if (proposal?.toPharmacyId !== userId) {
        logger.warn(
          `acceptExchangeProposal: User ${userId} is not the target pharmacy for proposal ${proposalId}`,
          {
            toPharmacyId: proposal?.toPharmacyId,
            actualUserId: userId,
          }
        );
        throw new HttpsError(
          "permission-denied",
          "Only the target pharmacy can accept this proposal"
        );
      }

      // Verify proposal is in pending state
      if (proposal?.status !== "pending") {
        logger.info(
          `acceptExchangeProposal: Cannot accept proposal with status ${proposal?.status}`,
          { proposalId, currentStatus: proposal?.status }
        );
        throw new HttpsError(
          "failed-precondition",
          `Cannot accept proposal with status: ${proposal?.status}. Only pending proposals can be accepted.`
        );
      }

      // ===== PHASE 3: READ ADDITIONAL DATA FOR DELIVERY CREATION =====

      // Read inventory item to get medicine details for delivery
      const inventoryRef = db
        .collection("pharmacy_inventory")
        .doc(proposal.inventoryItemId);
      const inventorySnapshot = await transaction.get(inventoryRef);

      if (!inventorySnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "Inventory item not found for this proposal"
        );
      }

      const inventoryData = inventorySnapshot.data();

      // Read pharmacy documents to get location and contact info
      const fromPharmacyRef = db
        .collection("pharmacies")
        .doc(proposal.fromPharmacyId);
      const toPharmacyRef = db.collection("pharmacies").doc(proposal.toPharmacyId);

      // Also read system_config/main to resolve the per-city courier fee.
      const systemConfigRef = db.collection("system_config").doc("main");
      const [fromPharmacySnapshot, toPharmacySnapshot, systemConfigSnapshot] =
        await Promise.all([
          transaction.get(fromPharmacyRef),
          transaction.get(toPharmacyRef),
          transaction.get(systemConfigRef),
        ]);

      if (!fromPharmacySnapshot.exists || !toPharmacySnapshot.exists) {
        throw new HttpsError("not-found", "Pharmacy data not found");
      }

      const fromPharmacy = fromPharmacySnapshot.data();
      const toPharmacy = toPharmacySnapshot.data();

      // Resolve courier fee from system_config/main → citiesByCountry → city.
      //  - Purchase proposals use `deliveryFee`
      //  - Exchange proposals use `exchangeFee`, with fallback to
      //    deliveryFee * 1.2 (exchanges require an additional trip).
      // Fallback for markets without per-city config: 12% of totalPrice,
      // which preserves the legacy Cameroon behavior.
      const proposalType = (proposal.details?.type as string) || "exchange";
      const totalPrice = (proposal.details?.totalPrice as number) || 0;
      const deliveryCountry: string =
        (fromPharmacy?.countryCode as string) ||
        (toPharmacy?.countryCode as string) ||
        "";
      const deliveryCity: string =
        (fromPharmacy?.cityCode as string) ||
        (toPharmacy?.cityCode as string) ||
        "";
      let courierFee = 0;
      try {
        const cfg = systemConfigSnapshot.exists
          ? systemConfigSnapshot.data() ?? {}
          : {};
        const cities = (cfg.citiesByCountry as Record<string, any>) ?? {};
        const cityCfg =
          cities[deliveryCountry]?.[deliveryCity] ?? null;
        const baseFee = Number(cityCfg?.deliveryFee);
        const explicitExchangeFee = Number(cityCfg?.exchangeFee);
        if (proposalType === "purchase" && Number.isFinite(baseFee) && baseFee > 0) {
          courierFee = Math.round(baseFee);
        } else if (proposalType === "exchange") {
          if (Number.isFinite(explicitExchangeFee) && explicitExchangeFee > 0) {
            courierFee = Math.round(explicitExchangeFee);
          } else if (Number.isFinite(baseFee) && baseFee > 0) {
            courierFee = Math.round(baseFee * 1.2);
          }
        }
        // Legacy fallback: no per-city config found → 12% of totalPrice.
        if (courierFee === 0 && totalPrice > 0) {
          courierFee = Math.round(totalPrice * 0.12);
        }
      } catch {
        courierFee = Math.round(totalPrice * 0.12);
      }
      logger.info("acceptExchangeProposal: resolved courier fee", {
        proposalType,
        deliveryCountry,
        deliveryCity,
        courierFee,
      });

      // Resolve the medicine display name for the delivery item. Priority:
      // 1. Denormalized `medicineName` on the inventory doc (new write path)
      // 2. `medicines/{medicineId}` document (custom medicines created via UI)
      // 3. Generic fallback.
      let resolvedMedicineName =
        (inventoryData?.medicineName as string) || "";
      const resolvedDosage =
        (inventoryData?.medicineDosage as string) ||
        (inventoryData?.dosage as string) ||
        "";
      const resolvedForm =
        (inventoryData?.medicineForm as string) ||
        (inventoryData?.form as string) ||
        "";
      if (!resolvedMedicineName) {
        const medicineId = (inventoryData?.medicineId as string) || "";
        if (medicineId) {
          try {
            const medDoc = await transaction.get(
              db.collection("medicines").doc(medicineId)
            );
            if (medDoc.exists) {
              const m = medDoc.data()!;
              const names = m.names as
                | { commonName?: string; brandNames?: string[] }
                | undefined;
              resolvedMedicineName =
                names?.brandNames?.[0] ||
                names?.commonName ||
                (m.name as string) ||
                "Unknown Medicine";
            }
          } catch (e) {
            logger.warn("acceptExchangeProposal: medicines lookup failed", {
              medicineId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        // Last-resort: derive a readable name from the kebab-case medicineId
        // (e.g. "artemether-lumefantrine-20-120" → "Artemether Lumefantrine 20 120").
        // Client-side catalogues (EssentialAfricanMedicines) use human-readable
        // ids, so this yields a usable label without a migration.
        if (!resolvedMedicineName && medicineId) {
          resolvedMedicineName = medicineId
            .split("-")
            .map((p) => p.length ? p[0].toUpperCase() + p.slice(1) : p)
            .join(" ")
            .trim();
        }
        if (!resolvedMedicineName) resolvedMedicineName = "Unknown Medicine";
      }

      // ===== PHASE 4: UPDATE WALLET BALANCE (held → deducted) =====

      // Only for purchase proposals (exchange proposals don't involve money transfer)
      if (proposal?.reservations?.walletReserved && proposal.details?.type === "purchase") {
        const walletRef = db
          .collection("wallets")
          .doc(proposal.fromPharmacyId);

        // Move balance from held → deducted (ready for payment capture after delivery)
        transaction.update(walletRef, {
          held: FieldValue.increment(-proposal.reservations.walletReserved),
          deducted: FieldValue.increment(proposal.reservations.walletReserved),
          updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info(
          `acceptExchangeProposal: Moved ${proposal.reservations.walletReserved} ${proposal.details?.currency || "XAF"} from held → deducted`,
          {
            userId: proposal.fromPharmacyId,
            amount: proposal.reservations.walletReserved,
          }
        );

        // Ledger: record the wallet hold commitment event
        const commitLedgerRef = db.collection("ledger").doc();
        transaction.set(commitLedgerRef, {
          type: "proposal_wallet_hold_committed",
          proposalId: proposalId,
          userId: proposal.fromPharmacyId,
          amount: proposal.reservations.walletReserved,
          currency: proposal.details?.currency || "XAF",
          from: "held",
          to: "deducted",
          description: "Wallet hold committed after proposal accepted",
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // ===== PHASE 5: CREATE DELIVERY ORDER =====

      const deliveryRef = db.collection("deliveries").doc(); // Auto-generate delivery ID

      // delivery.from = pickup (owner/seller), delivery.to = dropoff (proposer/buyer)
      // Same for both purchase and exchange:
      //   - pickup is always at the inventory owner (proposal.toPharmacyId)
      //   - dropoff is always at the proposer (proposal.fromPharmacyId)
      // For exchange, the return movement A->B is a back-office stock transfer, not a courier trip
      const pickupPharmacy = toPharmacy;
      const pickupId = proposal.toPharmacyId;
      const dropoffPharmacy = fromPharmacy;
      const dropoffId = proposal.fromPharmacyId;

      const deliveryData = {
        // Delivery identifiers
        deliveryId: deliveryRef.id,
        proposalId: proposalId,
        exchangeId: null, // Will be linked by exchangeCapture function

        // Pharmacy information (logistic roles: from = pickup, to = dropoff)
        fromPharmacyId: pickupId,
        fromPharmacyName: pickupPharmacy?.pharmacyName || pickupPharmacy?.name || pickupPharmacy?.displayName || "Unknown Pharmacy",
        fromPharmacyAddress: pickupPharmacy?.address || "",
        fromPharmacyCity: pickupPharmacy?.city || "",
        fromPharmacyCityCode: pickupPharmacy?.cityCode || citySlug(pickupPharmacy?.city || ""),
        fromPharmacyLocation: pickupPharmacy?.location || null,
        fromPharmacyPhone: pickupPharmacy?.phoneNumber || "",

        toPharmacyId: dropoffId,
        toPharmacyName: dropoffPharmacy?.pharmacyName || dropoffPharmacy?.name || dropoffPharmacy?.displayName || "Unknown Pharmacy",
        toPharmacyAddress: dropoffPharmacy?.address || "",
        toPharmacyCity: dropoffPharmacy?.city || "",
        toPharmacyCityCode: dropoffPharmacy?.cityCode || citySlug(dropoffPharmacy?.city || ""),
        toPharmacyLocation: dropoffPharmacy?.location || null,
        toPharmacyPhone: dropoffPharmacy?.phoneNumber || "",

        // Medicine/item details
        items: [
          {
            medicineId: inventoryData?.medicineId || "",
            medicineName: resolvedMedicineName,
            dosage: resolvedDosage,
            form: resolvedForm,
            quantity: proposal.details?.quantity || 0,
            packaging: inventoryData?.packaging || "",
          },
        ],

        // City for courier filtering (same city for both pharmacies).
        // Write both canonical cityCode and legacy city to support the transition period.
        city: fromPharmacy?.city || toPharmacy?.city || "",
        cityCode: fromPharmacy?.cityCode || toPharmacy?.cityCode ||
          citySlug(fromPharmacy?.city || toPharmacy?.city || ""),

        // Delivery status
        status: "pending", // pending → assigned → picked_up → in_transit → delivered
        courierId: null, // Assigned when courier accepts
        courierName: null,
        courierPhone: null,

        // Financial details
        proposalType: proposal.details?.type || "exchange",
        totalPrice: proposal.details?.totalPrice || 0,
        currency: proposal.details?.currency || "XAF",
        // Courier fee resolved from system_config/main per city (purchase:
        // deliveryFee; exchange: exchangeFee or deliveryFee × 1.2). Split 50/50
        // between buyer and seller at delivery completion by
        // completeExchangeDelivery. Falls back to 12% of totalPrice for legacy
        // markets without per-city config.
        courierFee,
        paymentStatus: "pending", // pending → paid

        // Timestamps
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        acceptedAt: FieldValue.serverTimestamp(),
        assignedAt: null,
        pickedUpAt: null,
        deliveredAt: null,

        // Additional tracking
        estimatedDeliveryTime: null,
        actualDeliveryTime: null,
        qrCodePickup: deliveryRef.id, // QR code for pickup verification
        qrCodeDelivery: `${deliveryRef.id}-delivery`, // QR code for delivery verification
        photoProofUrl: null, // Photo of delivered items
        deliveryNotes: notes || "",
      };

      transaction.set(deliveryRef, deliveryData);

      logger.info(
        `acceptExchangeProposal: Created delivery order ${deliveryRef.id}`,
        {
          proposalId,
          fromPharmacyId: proposal.fromPharmacyId,
          toPharmacyId: proposal.toPharmacyId,
          deliveryId: deliveryRef.id,
        }
      );

      // ===== PHASE 6: UPDATE PROPOSAL STATUS =====

      transaction.update(proposalRef, {
        status: "accepted",
        acceptedBy: userId,
        acceptedAt: FieldValue.serverTimestamp(),
        deliveryId: deliveryRef.id, // Link to delivery order
        updatedAt: FieldValue.serverTimestamp(),
        acceptanceNotes: notes || "",
      });

      logger.info(
        `acceptExchangeProposal: Proposal ${proposalId} accepted successfully`,
        {
          status: "accepted",
          acceptedBy: userId,
          deliveryId: deliveryRef.id,
          proposalType: proposal.details?.type,
          walletMoved: proposal?.reservations?.walletReserved || 0,
        }
      );

      return {
        success: true,
        proposalId,
        deliveryId: deliveryRef.id,
        status: "accepted",
        delivery: {
          id: deliveryRef.id,
          fromPharmacy: fromPharmacy?.pharmacyName || fromPharmacy?.name || fromPharmacy?.displayName || "Unknown",
          toPharmacy: toPharmacy?.pharmacyName || toPharmacy?.name || toPharmacy?.displayName || "Unknown",
          status: "pending",
        },
      };
    });

    return result;
  }
);
