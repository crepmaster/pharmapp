import { getFirestore, FieldValue } from "firebase-admin/firestore";

export async function cancelExchangeTx(exchangeId: string, reason = "expired") {
  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const exRef = db.collection("exchanges").doc(exchangeId);
    const exSnap = await tx.get(exRef);
    if (!exSnap.exists) throw new Error("exchange not found");
    const ex = exSnap.data() as any;
    if (ex.status !== "hold_active") return;

    const { aId, bId, holds, currency } = ex;
    const aHold = Number(holds?.a ?? 0);
    const bHold = Number(holds?.b ?? 0);

    const aRef = db.collection("wallets").doc(aId);
    const bRef = db.collection("wallets").doc(bId);
    const [aW, bW] = await Promise.all([tx.get(aRef), tx.get(bRef)]);
    const a = aW.data() as any; const b = bW.data() as any;

    if ((a?.held ?? 0) < aHold || (b?.held ?? 0) < bHold) {
      throw new Error("held mismatch");
    }

    // held -> available
    tx.update(aRef, { held: FieldValue.increment(-aHold), available: FieldValue.increment(+aHold), updatedAt: FieldValue.serverTimestamp() });
    tx.update(bRef, { held: FieldValue.increment(-bHold), available: FieldValue.increment(+bHold), updatedAt: FieldValue.serverTimestamp() });

    // ledger
    const lA = db.collection("ledger").doc();
    const lB = db.collection("ledger").doc();
    tx.set(lA, { userId: aId, type: "hold_release", amount: aHold, currency, exchangeId, reason, createdAt: FieldValue.serverTimestamp() });
    tx.set(lB, { userId: bId, type: "hold_release", amount: bHold, currency, exchangeId, reason, createdAt: FieldValue.serverTimestamp() });

    tx.update(exRef, { status: "canceled", canceledAt: FieldValue.serverTimestamp(), cancelReason: reason, updatedAt: FieldValue.serverTimestamp() });
  });
}
