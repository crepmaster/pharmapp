import { getFirestore, FieldValue } from "firebase-admin/firestore";
export async function withIdempotency(key, fn) {
    const db = getFirestore();
    const ref = db.collection("idempotency").doc(key);
    const created = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists)
            return false;
        tx.create(ref, { at: FieldValue.serverTimestamp() });
        return true;
    });
    if (!created)
        return false;
    await fn();
    return true;
}
