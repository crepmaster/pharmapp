/**
 * TD-COURIER-ASSIGN-GUARD (Lot B) — `assignCourierToDelivery`.
 *
 * Backend-owned, atomic courier claim. Replaces the client-write claim
 * (DeliveryService.acceptDelivery → direct `deliveries` update). Everything
 * needed to decide is read in ONE transaction, so nothing (wallet, territory,
 * config, delivery/proposal state) can change between check and write, and a
 * refusal leaves ZERO side effects.
 *
 * The trade territory is NOT taken from the denormalised `delivery.cityCode`:
 * it is re-derived from the two ANCHORED pharmacies and cross-checked against
 * the proposal's `currencyCode` snapshot via the shared guard primitive
 * (`assertMatchesSnapshotTerritory`). The courier is then matched against that
 * authoritative territory + currency + wallet (`assertCourierMatchesTrade`).
 *
 * Concurrency: the transaction re-reads the delivery; if two couriers claim at
 * once, Firestore's optimistic transaction retries the loser, which then sees
 * `status != pending` and is refused (`DELIVERY_NOT_ASSIGNABLE`). Exactly one
 * winner. Proven by the real-emulator concurrency test.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  assertMatchesSnapshotTerritory,
  assertCourierMatchesTrade,
} from "./lib/tradeCurrencyGuard.js";

const db = getFirestore();

interface AssignCourierInput {
  deliveryId: string;
}

export const assignCourierToDelivery = onCall<AssignCourierInput>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to claim a delivery."
      );
    }
    const deliveryId = request.data?.deliveryId;
    if (typeof deliveryId !== "string" || deliveryId.length === 0) {
      throw new HttpsError("invalid-argument", "deliveryId is required.");
    }

    return db.runTransaction(async (tx) => {
      // ===== PHASE 1: ALL READS (Firestore requires reads before writes) =====
      const deliveryRef = db.collection("deliveries").doc(deliveryId);
      const deliverySnap = await tx.get(deliveryRef);
      if (!deliverySnap.exists) {
        throw new HttpsError("not-found", "Delivery not found.");
      }
      const delivery = deliverySnap.data()!;

      // Caller must be a real, active courier.
      const courierSnap = await tx.get(db.collection("couriers").doc(uid));
      const courier = courierSnap.exists ? courierSnap.data()! : null;
      if (!courier || courier.role !== "courier" || courier.isActive !== true) {
        throw new HttpsError(
          "permission-denied",
          "Only an active courier can claim a delivery.",
          { code: "COURIER_NOT_ACTIVE" }
        );
      }

      // Delivery must be assignable (pending + unassigned). Re-checked on retry.
      if (delivery.status !== "pending" || delivery.courierId != null) {
        throw new HttpsError(
          "failed-precondition",
          "Delivery is not available to claim.",
          { code: "DELIVERY_NOT_ASSIGNABLE" }
        );
      }

      // Linked proposal — accepted + reciprocally linked.
      const proposalId = delivery.proposalId as string | undefined;
      if (!proposalId) {
        throw new HttpsError(
          "failed-precondition",
          "Delivery is not linked to a proposal.",
          { code: "DELIVERY_PROPOSAL_LINK_INVALID" }
        );
      }
      const proposalSnap = await tx.get(
        db.collection("exchange_proposals").doc(proposalId)
      );
      if (!proposalSnap.exists) {
        throw new HttpsError("not-found", "Linked proposal not found.");
      }
      const proposal = proposalSnap.data()!;
      if (proposal.status !== "accepted") {
        throw new HttpsError(
          "failed-precondition",
          "Linked proposal is not accepted.",
          { code: "PROPOSAL_NOT_ACCEPTED" }
        );
      }
      if (proposal.deliveryId !== deliveryId) {
        throw new HttpsError(
          "failed-precondition",
          "Delivery and proposal are not reciprocally linked.",
          { code: "DELIVERY_PROPOSAL_LINK_INVALID" }
        );
      }

      // Finance roles from the proposal (source of truth), NOT delivery logistics.
      const buyerId = proposal.fromPharmacyId as string;
      const sellerId = proposal.toPharmacyId as string;
      const [
        buyerPharmSnap,
        sellerPharmSnap,
        buyerWalletSnap,
        sellerWalletSnap,
        courierWalletSnap,
        sysConfigSnap,
      ] = await Promise.all([
        tx.get(db.collection("pharmacies").doc(buyerId)),
        tx.get(db.collection("pharmacies").doc(sellerId)),
        tx.get(db.collection("wallets").doc(buyerId)),
        tx.get(db.collection("wallets").doc(sellerId)),
        tx.get(db.collection("wallets").doc(uid)),
        tx.get(db.collection("system_config").doc("main")),
      ]);
      const sysConfigData = sysConfigSnap.exists ? sysConfigSnap.data() : undefined;

      // Re-derive the AUTHORITATIVE trade territory from the anchored pharmacies
      // and cross-check the proposal currency snapshot — never `delivery.cityCode`.
      const trade = assertMatchesSnapshotTerritory(
        {
          uid: buyerId,
          countryCode: buyerPharmSnap.data()?.countryCode,
          cityCode: buyerPharmSnap.data()?.cityCode ?? buyerPharmSnap.data()?.city,
          walletCurrency: buyerWalletSnap.data()?.currency,
        },
        {
          uid: sellerId,
          countryCode: sellerPharmSnap.data()?.countryCode,
          cityCode: sellerPharmSnap.data()?.cityCode ?? sellerPharmSnap.data()?.city,
          walletCurrency: sellerWalletSnap.data()?.currency,
        },
        sysConfigData,
        proposal.currencyCode,
        "assignCourierToDelivery"
      );

      // Courier must match that authoritative territory + currency + wallet.
      assertCourierMatchesTrade(
        {
          uid,
          countryCode: courier.countryCode,
          cityCode: courier.cityCode ?? courier.operatingCity ?? courier.city,
          walletCurrency: courierWalletSnap.data()?.currency,
        },
        trade,
        sysConfigData,
        "assignCourierToDelivery"
      );

      // ===== PHASE 2: SINGLE WRITE (compare-and-set) =====
      // Nothing above wrote. The transaction guarantees this write only lands
      // on the pending/unassigned state we read.
      tx.update(deliveryRef, {
        courierId: uid,
        courierName: (courier.fullName as string) ?? "",
        status: "accepted",
        assignedAt: FieldValue.serverTimestamp(),
        acceptedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info("assignCourierToDelivery: claimed", {
        deliveryId,
        courierUid: uid,
        proposalId,
        currency: trade.currency,
      });

      return {
        success: true,
        deliveryId,
        courierId: uid,
        status: "accepted",
      };
    });
  }
);
