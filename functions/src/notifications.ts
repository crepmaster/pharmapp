/**
 * Notification triggers — writes to notifications/{userId}/inbox/{id}
 *
 * Keep this module small and reactive: one trigger per collection event that
 * matters to the user. We avoid sending to user collections the caller does
 * not own; notifications live under the recipient's doc path so rules can be
 * simple (owner-read only).
 *
 * No FCM push here — that's a separate concern (N2). This module only writes
 * in-app inbox entries.
 */

import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface Notification {
  type: string;
  title: string;
  body: string;
  deeplink?: string;
  read: boolean;
  createdAt: FirebaseFirestore.FieldValue;
  metadata?: Record<string, unknown>;
}

async function writeInboxNotification(userId: string, notif: Omit<Notification, "createdAt" | "read">) {
  return db
    .collection("notifications")
    .doc(userId)
    .collection("inbox")
    .add({
      ...notif,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
}

/**
 * onDeliveryCreated — notify all active couriers in the delivery's city.
 * Fires when a new delivery document is created (post-proposal acceptance).
 */
export const onDeliveryCreatedNotifyCouriers = onDocumentCreated(
  { region: "europe-west1", document: "deliveries/{deliveryId}" },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const cityCode = (data.cityCode as string) || "";
    const legacyCity = (data.city as string) || "";
    const deliveryId = event.params.deliveryId;
    const totalPrice = (data.totalPrice as number) || 0;
    const courierFee = (data.courierFee as number) || 0;
    const currency = (data.currency as string) || "XAF";

    try {
      // Query active couriers in the same city. Prefer cityCode, fallback to
      // legacy city display name for pre-migration courier docs.
      const byCityCode = cityCode
        ? await db
            .collection("couriers")
            .where("cityCode", "==", cityCode)
            .where("isActive", "==", true)
            .get()
        : null;

      const byLegacyCity = legacyCity
        ? await db
            .collection("couriers")
            .where("operatingCity", "==", legacyCity)
            .where("isActive", "==", true)
            .get()
        : null;

      const seen = new Set<string>();
      const targets: string[] = [];
      for (const snap of [byCityCode, byLegacyCity]) {
        if (!snap) continue;
        for (const doc of snap.docs) {
          if (!seen.has(doc.id)) {
            seen.add(doc.id);
            targets.push(doc.id);
          }
        }
      }

      logger.info("onDeliveryCreatedNotifyCouriers", {
        deliveryId,
        cityCode,
        legacyCity,
        courierCount: targets.length,
      });

      const title = "New delivery available";
      const body = totalPrice > 0
        ? `${totalPrice} ${currency} order · earn ${courierFee} ${currency}`
        : `Exchange delivery · earn ${courierFee} ${currency}`;

      await Promise.all(
        targets.map((courierId) =>
          writeInboxNotification(courierId, {
            type: "delivery_available",
            title,
            body,
            deeplink: `/courier/orders/${deliveryId}`,
            metadata: { deliveryId, cityCode, courierFee, currency },
          })
        )
      );
    } catch (err) {
      logger.error("onDeliveryCreatedNotifyCouriers failed", { err });
    }
  }
);

/**
 * onDeliveryStatusChanged — notify both pharmacies on key transitions.
 */
export const onDeliveryStatusChangedNotifyPharmacies = onDocumentUpdated(
  { region: "europe-west1", document: "deliveries/{deliveryId}" },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === after.status) return;

    const deliveryId = event.params.deliveryId;
    // Note: delivery.from = pickup (seller), delivery.to = dropoff (buyer).
    const sellerId = (after.fromPharmacyId as string) || "";
    const buyerId = (after.toPharmacyId as string) || "";

    const newStatus: string = after.status as string;
    const items = Array.isArray(after.items) ? after.items : [];
    const medicineName =
      (items[0]?.medicineName as string) || "medicine";

    let buyerTitle = "";
    let sellerTitle = "";
    let body = "";
    let type = "delivery_status";

    switch (newStatus) {
      case "accepted":
        buyerTitle = "Courier assigned";
        sellerTitle = "Courier assigned for pickup";
        body = `A courier will pickup the ${medicineName} shortly.`;
        type = "delivery_accepted";
        break;
      case "picked_up":
      case "in_transit":
        buyerTitle = "Order en route";
        sellerTitle = "Pickup completed";
        body = `Your ${medicineName} is on the way.`;
        type = "delivery_in_transit";
        break;
      case "delivered":
      case "completed":
        buyerTitle = "Order delivered";
        sellerTitle = "Delivery completed — payment processed";
        body = `The ${medicineName} exchange is now complete.`;
        type = "delivery_completed";
        break;
      default:
        return; // Ignore other transitions (pending → pending, etc.)
    }

    try {
      await Promise.all([
        buyerId
          ? writeInboxNotification(buyerId, {
              type,
              title: buyerTitle,
              body,
              deeplink: `/pharmacy/exchanges/${deliveryId}`,
              metadata: { deliveryId, status: newStatus },
            })
          : null,
        sellerId && sellerId !== buyerId
          ? writeInboxNotification(sellerId, {
              type,
              title: sellerTitle,
              body,
              deeplink: `/pharmacy/exchanges/${deliveryId}`,
              metadata: { deliveryId, status: newStatus },
            })
          : null,
      ]);
      logger.info("onDeliveryStatusChangedNotifyPharmacies", {
        deliveryId,
        newStatus,
        buyerId,
        sellerId,
      });
    } catch (err) {
      logger.error("onDeliveryStatusChangedNotifyPharmacies failed", { err });
    }
  }
);
