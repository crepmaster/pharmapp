import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import crypto from "node:crypto";
// 👉 helpers (déjà dans src/lib)
import { withIdempotency } from "./lib/idempotency.js";
import { cancelExchangeTx } from "./lib/exchange.js";
import { validateFields, validators, sendValidationError, sendError, BusinessErrors, AppError } from "./lib/validation.js";
// 👉 expose aussi la tâche planifiée
export { expireExchangeHolds } from "./scheduled.js";
export { cleanupTestUser } from "./cleanup.js";
// --------- Admin init ---------
if (getApps().length === 0)
    initializeApp();
const db = getFirestore();
// --------- Secrets ---------
const MOMO_TOKEN = defineSecret("MOMO_CALLBACK_TOKEN");
const ORANGE_TOKEN = defineSecret("ORANGE_CALLBACK_TOKEN");
// --------- Utils ---------
function requireJson(req, res) {
    if (req.method !== "POST") {
        res.status(405).send("method not allowed");
        return true;
    }
    const ct = String(req.headers["content-type"] ?? "").toLowerCase();
    if (!ct.startsWith("application/json")) {
        res.status(415).send("use application/json");
        return true;
    }
    return false;
}
function getInboundToken(req) {
    const v = req.get?.("x-callback-token") ?? req.query?.token ?? "";
    return String(v ?? "").trim();
}
function walletInit(currency = "XAF") {
    return { available: 0, held: 0, currency, updatedAt: FieldValue.serverTimestamp() };
}
// ---------- Health ----------
export const health = onRequest({ region: "europe-west1", cors: true }, (_req, res) => {
    res.status(200).send("ok");
});
// ======================= Unified Authentication Services =======================
// Import unified auth functions
export { createPharmacyUser, createCourierUser, createAdminUser, cleanupTestUserUnified } from "./auth/unified-auth-functions.js";

// ======================= Exchange Proposal Workflow Functions =======================
// Import exchange proposal lifecycle functions
export { createExchangeProposal } from "./createExchangeProposal.js";
export { cancelExchangeProposal } from "./cancelExchangeProposal.js";
export { acceptExchangeProposal } from "./acceptExchangeProposal.js";
export { completeExchangeDelivery } from "./completeExchangeDelivery.js";
// ---------- Get Wallet Balance ----------
export const getWallet = onRequest({ region: "europe-west1", cors: true }, async (req, res) => {
    try {
        const userId = req.query?.userId;
        if (!userId) {
            res.status(400).json({ error: "userId is required" });
            return;
        }
        // Get or create wallet
        const walletRef = db.collection("wallets").doc(userId);
        const walletDoc = await walletRef.get();
        if (!walletDoc.exists) {
            // Create wallet if it doesn't exist
            const initialWallet = walletInit();
            await walletRef.set(initialWallet);
            res.status(200).json(initialWallet);
        }
        else {
            res.status(200).json(walletDoc.data());
        }
    }
    catch (error) {
        logger.error("getWallet error", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// ---------- Create Top-up Intent ----------
export const topupIntent = onRequest({ region: "europe-west1" }, async (req, res) => {
    try {
        if (requireJson(req, res))
            return;
        const { userId, method, amount, currency = "XAF", msisdn = null } = req.body ?? {};
        // Validate input
        const errors = validateFields({ userId, method, amount, currency }, {
            userId: validators.required,
            method: (v, f) => validators.required(v, f) || validators.string(v, f, { minLength: 3, maxLength: 20 }),
            amount: (v, f) => validators.required(v, f) || validators.amount(v, f),
            currency: validators.currency
        });
        if (errors.length > 0) {
            return sendValidationError(res, errors);
        }
        // Validate payment method
        const validMethods = ["mtn_momo", "orange_money"];
        if (!validMethods.includes(method)) {
            sendValidationError(res, [{
                    field: "method",
                    message: `Method must be one of: ${validMethods.join(", ")}`,
                    code: "INVALID_METHOD"
                }]);
            return;
        }
        // Validate userId format
        const userIdError = validators.userId(userId, "userId");
        if (userIdError) {
            return sendValidationError(res, [userIdError]);
        }
        const doc = db.collection("payments").doc();
        await doc.set({
            userId, method, amount: Number(amount), currency, msisdn,
            status: "pending",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        res.status(201).json({ paymentId: doc.id, status: "pending" });
    }
    catch (error) {
        sendError(res, error);
    }
});
async function handleWebhook(opts) {
    const { req, res, provider, expectedToken, extract } = opts;
    if (requireJson(req, res))
        return;
    // auth
    const got = getInboundToken(req);
    const expected = String(expectedToken ?? "").trim();
    if (!expected || got !== expected) {
        throw BusinessErrors.WEBHOOK_UNAUTHORIZED();
    }
    const body = typeof req.body === "object" ? req.body : {};
    const { providerTxnId, paymentId, amount, currency } = extract(body, req.headers);
    const pid = paymentId ?? `${provider}_${providerTxnId}`;
    await withIdempotency(`${provider}:${providerTxnId}`, async () => {
        await db.runTransaction(async (tx) => {
            const payRef = db.collection("payments").doc(pid);
            const logRef = db.collection("webhook_logs").doc(`${provider}:${providerTxnId}`);
            // ----- READS FIRST -----
            const paySnap = await tx.get(payRef);
            const payment = paySnap.exists ? (paySnap.data() ?? {}) : {};
            const userId = payment.userId;
            let walletRef = null;
            let walletSnap = null;
            const amt = amount ?? payment?.amount ?? null;
            const cur = currency ?? payment?.currency ?? "XAF";
            if (userId && typeof amt === "number" && amt > 0) {
                walletRef = db.collection("wallets").doc(userId);
                walletSnap = await tx.get(walletRef);
            }
            // ----- WRITES AFTER ALL READS -----
            // webhook log (avec TTL-friendly fields)
            tx.set(logRef, {
                provider,
                providerTxnId,
                paymentId: pid,
                receivedAt: FieldValue.serverTimestamp(),
                expireAt: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // ~30j
                headers: req.headers,
                payload: body,
            }, { merge: true });
            // upsert payment
            tx.set(payRef, {
                method: provider,
                status: "succeeded",
                amount: amt,
                currency: cur,
                gatewayRef: providerTxnId,
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            // credit wallet + ledger
            if (userId && walletRef && typeof amt === "number" && amt > 0) {
                if (!walletSnap.exists) {
                    tx.set(walletRef, walletInit(cur), { merge: true });
                }
                tx.update(walletRef, {
                    available: FieldValue.increment(amt),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                const lref = db.collection("ledger").doc();
                tx.set(lref, {
                    userId,
                    type: "topup",
                    amount: amt,
                    currency: cur,
                    from: "external",
                    to: "wallet",
                    provider,
                    paymentId: pid,
                    createdAt: FieldValue.serverTimestamp(),
                });
            }
        });
    });
    res.status(200).send("ok");
}
// ---------- MTN MoMo Webhook ----------
export const momoWebhook = onRequest({ region: "europe-west1", secrets: [MOMO_TOKEN] }, async (req, res) => {
    try {
        logger.info("momo webhook received", { headers: req.headers });
        await handleWebhook({
            req,
            res,
            provider: "mtn_momo",
            expectedToken: (MOMO_TOKEN.value() ?? "").trim(),
            extract: (b, h) => ({
                providerTxnId: b?.financialTransactionId ||
                    b?.referenceId ||
                    h?.["x-reference-id"] ||
                    crypto.randomUUID(),
                paymentId: b?.paymentId,
                amount: b?.amount,
                currency: b?.currency ?? "XAF",
            }),
        });
        return;
    }
    catch (error) {
        if (error instanceof AppError && error.code === "WEBHOOK_UNAUTHORIZED") {
            return sendError(res, error);
        }
        logger.error("momo webhook error", error);
        res.status(200).send("ok");
    }
});
// ---------- Orange Money Webhook ----------
export const orangeWebhook = onRequest({ region: "europe-west1", secrets: [ORANGE_TOKEN] }, async (req, res) => {
    try {
        logger.info("orange webhook received", { headers: req.headers });
        await handleWebhook({
            req,
            res,
            provider: "orange_money",
            expectedToken: (ORANGE_TOKEN.value() ?? "").trim(),
            extract: (b, h) => ({
                providerTxnId: b?.transactionId ||
                    b?.payToken ||
                    h?.["x-signature-id"] ||
                    crypto.randomUUID(),
                paymentId: b?.paymentId,
                amount: b?.amount,
                currency: b?.currency ?? "XAF",
            }),
        });
        return;
    }
    catch (error) {
        if (error instanceof AppError && error.code === "WEBHOOK_UNAUTHORIZED") {
            return sendError(res, error);
        }
        logger.error("orange webhook error", error);
        res.status(200).send("ok");
    }
});
// ======================= Exchange endpoints =======================
// 1) HOLD 50/50
export const createExchangeHold = onRequest({ region: "europe-west1" }, async (req, res) => {
    try {
        if (requireJson(req, res))
            return;
        const { exchangeId, aId, bId, courierFee, currency = "XAF", idempotencyKey } = req.body ?? {};
        // Validate required fields
        const errors = validateFields({ aId, bId, courierFee, currency }, {
            aId: (v, f) => validators.required(v, f) || validators.userId(v, f),
            bId: (v, f) => validators.required(v, f) || validators.userId(v, f),
            courierFee: (v, f) => validators.required(v, f) || validators.amount(v, f),
            currency: validators.currency
        });
        if (errors.length > 0) {
            return sendValidationError(res, errors);
        }
        // Business validation
        if (aId === bId) {
            sendValidationError(res, [{
                    field: "bId",
                    message: "User A and User B cannot be the same",
                    code: "IDENTICAL_USERS"
                }]);
            return;
        }
        if (exchangeId && typeof exchangeId !== "string") {
            sendValidationError(res, [{
                    field: "exchangeId",
                    message: "exchangeId must be a string",
                    code: "INVALID_TYPE"
                }]);
            return;
        }
        const holdKey = `hold:${exchangeId ?? idempotencyKey ?? `${aId}:${bId}:${courierFee}:${currency}`}`;
        const halfA = Math.floor(Number(courierFee) / 2);
        const halfB = Number(courierFee) - halfA;
        const exId = exchangeId ?? db.collection("exchanges").doc().id;
        await withIdempotency(holdKey, async () => {
            await db.runTransaction(async (tx) => {
                const aRef = db.collection("wallets").doc(aId);
                const bRef = db.collection("wallets").doc(bId);
                const exRef = db.collection("exchanges").doc(exId);
                // READS
                const [aSnap, bSnap] = await Promise.all([tx.get(aRef), tx.get(bRef)]);
                const a = aSnap.data();
                const b = bSnap.data();
                if (!a)
                    throw BusinessErrors.WALLET_NOT_FOUND(aId);
                if (!b)
                    throw BusinessErrors.WALLET_NOT_FOUND(bId);
                if ((a.available ?? 0) < halfA) {
                    throw BusinessErrors.INSUFFICIENT_FUNDS(`User ${aId} needs ${halfA} but only has ${a.available ?? 0} available`);
                }
                if ((b.available ?? 0) < halfB) {
                    throw BusinessErrors.INSUFFICIENT_FUNDS(`User ${bId} needs ${halfB} but only has ${b.available ?? 0} available`);
                }
                // WRITES
                tx.update(aRef, {
                    available: FieldValue.increment(-halfA),
                    held: FieldValue.increment(+halfA),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                tx.update(bRef, {
                    available: FieldValue.increment(-halfB),
                    held: FieldValue.increment(+halfB),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                tx.set(exRef, {
                    aId,
                    bId,
                    currency,
                    courierFee: Number(courierFee),
                    holds: { a: halfA, b: halfB },
                    status: "hold_active",
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                }, { merge: true });
                const lA = db.collection("ledger").doc();
                const lB = db.collection("ledger").doc();
                tx.set(lA, { userId: aId, type: "hold", amount: halfA, currency, exchangeId: exId, createdAt: FieldValue.serverTimestamp() });
                tx.set(lB, { userId: bId, type: "hold", amount: halfB, currency, exchangeId: exId, createdAt: FieldValue.serverTimestamp() });
            });
            return;
        });
        res.status(200).json({ ok: true, status: "hold_active", exchangeId: exId });
    }
    catch (error) {
        sendError(res, error);
    }
});
// 2) CAPTURE (payer le coursier)
export const exchangeCapture = onRequest({ region: "europe-west1" }, async (req, res) => {
    try {
        if (requireJson(req, res))
            return;
        const { exchangeId, courierId, saleAmount = 0, sellerId, buyerId } = req.body ?? {};
        // Validate required fields
        const errors = validateFields({ exchangeId, courierId }, {
            exchangeId: validators.required,
            courierId: (v, f) => validators.required(v, f) || validators.userId(v, f)
        });
        if (errors.length > 0) {
            return sendValidationError(res, errors);
        }
        // Validate optional fields
        if (saleAmount && typeof saleAmount !== "number") {
            sendValidationError(res, [{
                    field: "saleAmount",
                    message: "saleAmount must be a number",
                    code: "INVALID_TYPE"
                }]);
            return;
        }
        if (saleAmount && saleAmount < 0) {
            sendValidationError(res, [{
                    field: "saleAmount",
                    message: "saleAmount must be non-negative",
                    code: "INVALID_AMOUNT"
                }]);
            return;
        }
        if (sellerId && validators.userId(sellerId, "sellerId")) {
            return sendValidationError(res, [validators.userId(sellerId, "sellerId")]);
        }
        if (buyerId && validators.userId(buyerId, "buyerId")) {
            return sendValidationError(res, [validators.userId(buyerId, "buyerId")]);
        }
        // Validate that if saleAmount > 0, both seller and buyer must be provided
        if (saleAmount > 0 && (!sellerId || !buyerId)) {
            sendValidationError(res, [{
                    field: saleAmount > 0 && !sellerId ? "sellerId" : "buyerId",
                    message: "Both sellerId and buyerId are required when saleAmount > 0",
                    code: "REQUIRED_FOR_SALE"
                }]);
            return;
        }
        await withIdempotency(`capture:${exchangeId}`, async () => {
            await db.runTransaction(async (tx) => {
                const exRef = db.collection("exchanges").doc(exchangeId);
                const courierRef = db.collection("wallets").doc(courierId);
                // ----- READS FIRST -----
                const exSnap = await tx.get(exRef);
                if (!exSnap.exists)
                    throw BusinessErrors.EXCHANGE_NOT_FOUND(exchangeId);
                const exchange = exSnap.data();
                if (exchange.status !== "hold_active") {
                    throw BusinessErrors.EXCHANGE_INVALID_STATUS(exchange.status, "hold_active");
                }
                const { aId, bId, holds, currency } = exchange;
                const aHold = Number(holds?.a ?? 0);
                const bHold = Number(holds?.b ?? 0);
                const totalHeld = aHold + bHold;
                // Get wallet references and snapshots
                const aRef = db.collection("wallets").doc(aId);
                const bRef = db.collection("wallets").doc(bId);
                const [aSnap, bSnap, courierSnap] = await Promise.all([
                    tx.get(aRef),
                    tx.get(bRef),
                    tx.get(courierRef)
                ]);
                const aWallet = aSnap.data();
                const bWallet = bSnap.data();
                // Validate held amounts
                if (!aWallet)
                    throw BusinessErrors.WALLET_NOT_FOUND(aId);
                if (!bWallet)
                    throw BusinessErrors.WALLET_NOT_FOUND(bId);
                if ((aWallet.held ?? 0) < aHold) {
                    throw BusinessErrors.INSUFFICIENT_FUNDS(`User ${aId} has insufficient held funds: needs ${aHold}, has ${aWallet.held ?? 0}`);
                }
                if ((bWallet.held ?? 0) < bHold) {
                    throw BusinessErrors.INSUFFICIENT_FUNDS(`User ${bId} has insufficient held funds: needs ${bHold}, has ${bWallet.held ?? 0}`);
                }
                // ----- WRITES AFTER ALL READS -----
                // Process the pharmaceutical sale transaction if saleAmount is provided
                let buyerRef = null;
                let sellerRef = null;
                if (saleAmount > 0 && sellerId && buyerId) {
                    // Validate that we have the required parties for a sale
                    if (sellerId === buyerId) {
                        throw BusinessErrors.EXCHANGE_INVALID_STATUS("invalid", "seller and buyer cannot be the same");
                    }
                    buyerRef = db.collection("wallets").doc(buyerId);
                    sellerRef = db.collection("wallets").doc(sellerId);
                    // Read buyer wallet to check if they have sufficient funds
                    const buyerSnap = await tx.get(buyerRef);
                    const buyerWallet = buyerSnap.data();
                    if (!buyerWallet)
                        throw BusinessErrors.WALLET_NOT_FOUND(buyerId);
                    if ((buyerWallet.available ?? 0) < saleAmount) {
                        throw BusinessErrors.INSUFFICIENT_FUNDS(`Buyer ${buyerId} needs ${saleAmount} but only has ${buyerWallet.available ?? 0} available`);
                    }
                    // Transfer sale amount from buyer to seller
                    tx.update(buyerRef, {
                        available: FieldValue.increment(-saleAmount),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    // Create seller wallet if it doesn't exist, then credit them
                    const sellerSnap = await tx.get(sellerRef);
                    if (!sellerSnap.exists) {
                        tx.set(sellerRef, walletInit(currency), { merge: true });
                    }
                    tx.update(sellerRef, {
                        available: FieldValue.increment(saleAmount),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                }
                // Release courier fee holds from A and B
                tx.update(aRef, {
                    held: FieldValue.increment(-aHold),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                tx.update(bRef, {
                    held: FieldValue.increment(-bHold),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                // Create or update courier wallet and pay them the courier fee
                if (!courierSnap.exists) {
                    tx.set(courierRef, walletInit(currency), { merge: true });
                }
                tx.update(courierRef, {
                    available: FieldValue.increment(totalHeld),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                // Update exchange status
                tx.update(exRef, {
                    status: "completed",
                    courierId,
                    completedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    ...(saleAmount && { saleAmount }),
                    ...(sellerId && { sellerId }),
                    ...(buyerId && { buyerId }),
                });
                // Create ledger entries
                const ledgerEntries = [
                    // Courier fee hold releases
                    {
                        userId: aId,
                        type: "hold_release",
                        amount: aHold,
                        currency,
                        from: "held",
                        to: "courier",
                        exchangeId,
                        courierId,
                        description: "Courier fee payment (party A)",
                        createdAt: FieldValue.serverTimestamp(),
                    },
                    {
                        userId: bId,
                        type: "hold_release",
                        amount: bHold,
                        currency,
                        from: "held",
                        to: "courier",
                        exchangeId,
                        courierId,
                        description: "Courier fee payment (party B)",
                        createdAt: FieldValue.serverTimestamp(),
                    },
                    // Courier payment
                    {
                        userId: courierId,
                        type: "courier_payment",
                        amount: totalHeld,
                        currency,
                        from: "exchange",
                        to: "wallet",
                        exchangeId,
                        description: "Courier service fee",
                        createdAt: FieldValue.serverTimestamp(),
                    }
                ];
                // Add pharmaceutical sale transaction ledger entries if sale occurred
                if (saleAmount > 0 && sellerId && buyerId) {
                    ledgerEntries.push(
                    // Buyer payment
                    {
                        userId: buyerId,
                        type: "pharmaceutical_purchase",
                        amount: saleAmount,
                        currency,
                        from: "wallet",
                        to: "seller",
                        exchangeId,
                        sellerId: sellerId,
                        description: "Pharmaceutical purchase payment",
                        createdAt: FieldValue.serverTimestamp(),
                    }, 
                    // Seller receipt
                    {
                        userId: sellerId,
                        type: "pharmaceutical_sale",
                        amount: saleAmount,
                        currency,
                        from: "buyer",
                        to: "wallet",
                        exchangeId,
                        buyerId: buyerId,
                        description: "Pharmaceutical sale receipt",
                        createdAt: FieldValue.serverTimestamp(),
                    });
                }
                ledgerEntries.forEach(entry => {
                    const ledgerRef = db.collection("ledger").doc();
                    tx.set(ledgerRef, entry);
                });
            });
            return;
        });
        res.status(200).json({ ok: true, status: "completed" });
    }
    catch (error) {
        sendError(res, error);
    }
});
// 3) CANCEL (rend les holds)
export const exchangeCancel = onRequest({ region: "europe-west1" }, async (req, res) => {
    try {
        if (requireJson(req, res))
            return;
        const { exchangeId } = req.body ?? {};
        // Validate required field
        if (!exchangeId) {
            sendValidationError(res, [{
                    field: "exchangeId",
                    message: "exchangeId is required",
                    code: "REQUIRED"
                }]);
            return;
        }
        if (typeof exchangeId !== "string") {
            sendValidationError(res, [{
                    field: "exchangeId",
                    message: "exchangeId must be a string",
                    code: "INVALID_TYPE"
                }]);
            return;
        }
        await withIdempotency(`cancel:${exchangeId}`, async () => {
            await cancelExchangeTx(exchangeId);
        });
        res.status(200).json({ ok: true, status: "canceled" });
    }
    catch (error) {
        sendError(res, error);
    }
});
// 🔒 SUBSCRIPTION SECURITY FUNCTIONS (CRITICAL FOR REVENUE PROTECTION)
// Helper function to get and validate subscription status
async function getValidSubscription(userId) {
    const pharmacyDoc = await db.collection("pharmacies").doc(userId).get();
    if (!pharmacyDoc.exists) {
        throw BusinessErrors.USER_NOT_FOUND(userId);
    }
    const pharmacy = pharmacyDoc.data();
    const now = new Date();
    // Check if subscription is active or in trial
    const isActive = pharmacy.subscriptionStatus === "active" &&
        pharmacy.subscriptionEndDate &&
        new Date(pharmacy.subscriptionEndDate.toDate()) > now;
    const isTrial = pharmacy.subscriptionStatus === "trial" &&
        (!pharmacy.subscriptionEndDate || new Date(pharmacy.subscriptionEndDate.toDate()) > now);
    return {
        isValid: isActive || isTrial,
        status: pharmacy.subscriptionStatus,
        plan: pharmacy.subscriptionPlan || "basic",
        endDate: pharmacy.subscriptionEndDate,
        pharmacy
    };
}
// Validate inventory creation (server-side enforcement)
export const validateInventoryAccess = onRequest({ region: "europe-west1" }, async (req, res) => {
    try {
        const userId = req.query?.userId;
        if (!userId) {
            sendValidationError(res, [{
                    field: "userId",
                    message: "userId is required",
                    code: "REQUIRED"
                }]);
            return;
        }
        const subscription = await getValidSubscription(userId);
        if (!subscription.isValid) {
            res.status(403).json({
                error: "SUBSCRIPTION_REQUIRED",
                message: "Active subscription required to add inventory",
                status: subscription.status,
                canAccess: false
            });
            return;
        }
        // Check plan-specific limits for basic plan
        if (subscription.plan === "basic") {
            const inventoryQuery = await db
                .collection("pharmacy_inventory")
                .where("pharmacyId", "==", userId)
                .get();
            const currentCount = inventoryQuery.size;
            const maxAllowed = 100;
            if (currentCount >= maxAllowed) {
                res.status(403).json({
                    error: "INVENTORY_LIMIT_EXCEEDED",
                    message: `Basic plan allows maximum ${maxAllowed} medicines. Current: ${currentCount}`,
                    currentCount,
                    maxAllowed,
                    plan: subscription.plan,
                    canAccess: false
                });
            }
        }
        // Log successful validation for audit
        await db.collection("subscription_audit").add({
            userId,
            action: "inventory_access_validated",
            plan: subscription.plan,
            status: subscription.status,
            timestamp: FieldValue.serverTimestamp()
        });
        res.status(200).json({
            canAccess: true,
            plan: subscription.plan,
            status: subscription.status,
            remainingSlots: subscription.plan === "basic"
                ? Math.max(0, 100 - (await db.collection("pharmacy_inventory").where("pharmacyId", "==", userId).get()).size)
                : -1 // Unlimited
        });
    }
    catch (error) {
        sendError(res, error);
    }
});
// Validate proposal creation (server-side enforcement) 
export const validateProposalAccess = onRequest({ region: "europe-west1" }, async (req, res) => {
    try {
        const userId = req.query?.userId;
        if (!userId) {
            sendValidationError(res, [{
                    field: "userId",
                    message: "userId is required",
                    code: "REQUIRED"
                }]);
            return;
        }
        const subscription = await getValidSubscription(userId);
        if (!subscription.isValid) {
            res.status(403).json({
                error: "SUBSCRIPTION_REQUIRED",
                message: "Active subscription required to create proposals",
                status: subscription.status,
                canAccess: false
            });
            return;
        }
        // Log successful validation for audit
        await db.collection("subscription_audit").add({
            userId,
            action: "proposal_access_validated",
            plan: subscription.plan,
            status: subscription.status,
            timestamp: FieldValue.serverTimestamp()
        });
        res.status(200).json({
            canAccess: true,
            plan: subscription.plan,
            status: subscription.status
        });
    }
    catch (error) {
        sendError(res, error);
    }
});
// Validate analytics access (server-side enforcement)
export const validateAnalyticsAccess = onRequest({ region: "europe-west1" }, async (req, res) => {
    try {
        const userId = req.query?.userId;
        if (!userId) {
            sendValidationError(res, [{
                    field: "userId",
                    message: "userId is required",
                    code: "REQUIRED"
                }]);
            return;
        }
        const subscription = await getValidSubscription(userId);
        if (!subscription.isValid) {
            res.status(403).json({
                error: "SUBSCRIPTION_REQUIRED",
                message: "Active subscription required for analytics",
                status: subscription.status,
                canAccess: false
            });
            return;
        }
        // Analytics only available for professional and enterprise plans
        const allowedPlans = ["professional", "enterprise"];
        if (!allowedPlans.includes(subscription.plan)) {
            res.status(403).json({
                error: "PLAN_UPGRADE_REQUIRED",
                message: "Professional or Enterprise plan required for analytics",
                currentPlan: subscription.plan,
                requiredPlans: allowedPlans,
                canAccess: false
            });
            return;
        }
        res.status(200).json({
            canAccess: true,
            plan: subscription.plan,
            status: subscription.status
        });
    }
    catch (error) {
        sendError(res, error);
    }
});
// Get comprehensive subscription status (server-side truth source)
export const getSubscriptionStatus = onRequest({ region: "europe-west1" }, async (req, res) => {
    try {
        const userId = req.query?.userId;
        if (!userId) {
            sendValidationError(res, [{
                    field: "userId",
                    message: "userId is required",
                    code: "REQUIRED"
                }]);
            return;
        }
        const subscription = await getValidSubscription(userId);
        // Calculate remaining days
        let daysRemaining = 0;
        if (subscription.endDate) {
            const endDate = new Date(subscription.endDate.toDate());
            const now = new Date();
            daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        }
        // Get current usage for basic plan
        let currentInventoryCount = 0;
        if (subscription.plan === "basic") {
            const inventoryQuery = await db
                .collection("pharmacy_inventory")
                .where("pharmacyId", "==", userId)
                .get();
            currentInventoryCount = inventoryQuery.size;
        }
        res.status(200).json({
            userId,
            isValid: subscription.isValid,
            status: subscription.status,
            plan: subscription.plan,
            daysRemaining,
            endDate: subscription.endDate?.toDate(),
            limits: {
                inventory: subscription.plan === "basic" ? { max: 100, current: currentInventoryCount } : { unlimited: true },
                analytics: ["professional", "enterprise"].includes(subscription.plan),
                multiLocation: subscription.plan === "enterprise",
                apiAccess: subscription.plan === "enterprise"
            }
        });
    }
    catch (error) {
        sendError(res, error);
    }
});
// ========== SANDBOX TESTING ==========
/**
 * Sandbox Credit Function for Testing
 * Credits test wallets with fake money for development/testing purposes
 *
 * Security: Only works for test accounts and development environment
 */
export const sandboxCredit = onRequest({
    region: "europe-west1",
    cors: true
}, async (req, res) => {
    try {
        if (requireJson(req, res))
            return;
        const { userId, amount, description = "Sandbox test credit" } = req.body ?? {};
        // Validate required fields
        const errors = validateFields({ userId, amount }, {
            userId: validators.required,
            amount: (v, f) => validators.required(v, f) || (typeof v !== "number" || v <= 0 ?
                { field: f, message: `${f} must be a positive number`, code: 'INVALID_AMOUNT' } : null)
        });
        if (errors.length > 0) {
            return sendValidationError(res, errors);
        }
        // Security: Only allow test accounts
        const testAccountPatterns = [
            /^.*@gmail\.com$/,  // Allow Gmail accounts for development
            /^.*@promoshake\.net$/,
            /^test.*@.*$/,
            /^.*test.*@.*$/,
            /^sandbox.*@.*$/,
            /^dev.*@.*$/
        ];
        // Get user document from pharmacies or couriers collection
        let userDoc = await db.collection("pharmacies").doc(userId).get();
        let userData = null;
        if (!userDoc.exists) {
            userDoc = await db.collection("couriers").doc(userId).get();
        }
        if (!userDoc.exists) {
            res.status(404).json({
                error: "User not found in pharmacies or couriers collection",
                code: "USER_NOT_FOUND"
            });
            return;
        }
        userData = userDoc.data();
        const userEmail = userData?.email || "";
        // Check if email matches test patterns
        const isTestAccount = testAccountPatterns.some(pattern => pattern.test(userEmail));
        if (!isTestAccount) {
            res.status(403).json({
                error: "Sandbox credit only allowed for test accounts",
                code: "NOT_TEST_ACCOUNT",
                hint: "Use email patterns: *@promoshake.net, test*@*, *test*@*, sandbox*@*, dev*@*"
            });
            return;
        }
        // Limit sandbox credits
        if (amount > 100000) { // Max 100,000 XAF
            res.status(400).json({
                error: "Maximum sandbox credit is 100,000 XAF",
                code: "AMOUNT_TOO_HIGH"
            });
            return;
        }
        const currency = "XAF";
        const amountCents = Math.round(amount * 100); // Convert to cents
        // Credit wallet with transaction
        await db.runTransaction(async (tx) => {
            const walletRef = db.collection("wallets").doc(userId);
            const walletDoc = await tx.get(walletRef);
            let currentWallet;
            if (!walletDoc.exists) {
                // Create new wallet
                currentWallet = walletInit(currency);
                tx.set(walletRef, {
                    ...currentWallet,
                    userId,
                    userType: userData?.userType || "unknown",
                    createdAt: FieldValue.serverTimestamp(),
                });
            }
            else {
                currentWallet = walletDoc.data();
            }
            // Update wallet balance
            const newAvailable = (currentWallet.available || 0) + amountCents;
            tx.update(walletRef, {
                available: newAvailable,
                updatedAt: FieldValue.serverTimestamp(),
            });
            // Add ledger entry
            const ledgerRef = db.collection("ledger").doc();
            tx.set(ledgerRef, {
                userId,
                type: "sandbox_credit",
                amount: amountCents,
                currency,
                description,
                createdAt: FieldValue.serverTimestamp(),
                metadata: {
                    isSandbox: true,
                    userEmail,
                    originalAmount: amount
                }
            });
        });
        logger.info("Sandbox credit applied", {
            userId,
            amount,
            userEmail,
            description
        });
        res.status(200).json({
            success: true,
            message: "Sandbox credit applied successfully",
            userId,
            creditedAmount: amount,
            currency,
            isSandbox: true,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger.error("Sandbox credit failed", { error: error.message });
        sendError(res, error);
    }
});

// ========== DEV SUBSCRIPTION (for testing) ==========
export const devSubscription = onRequest({
    region: "europe-west1",
    cors: true
}, async (req, res) => {
    try {
        const { pharmacyId } = req.body;

        if (!pharmacyId) {
            return res.status(400).json({ error: "Missing pharmacyId in request body" });
        }

        // Get pharmacy document
        const pharmacyDoc = await db.collection('pharmacies').doc(pharmacyId).get();

        if (!pharmacyDoc.exists) {
            return res.status(404).json({ error: "Pharmacy not found" });
        }

        const pharmacyData = pharmacyDoc.data();
        const email = pharmacyData?.email || '';

        // Security check: Only allow test accounts
        const testPatterns = [
            /@gmail\.com$/i,
            /@promoshake\.net$/i,
            /^test/i,
            /@test\./i,
        ];

        const isTestAccount = testPatterns.some(pattern => pattern.test(email));

        if (!isTestAccount) {
            return res.status(403).json({
                error: 'devSubscription only works with test accounts (gmail.com, promoshake.net, test*)',
                email: email,
            });
        }

        // Create 30-day trial subscription
        const now = Timestamp.now();
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 30);

        const trialSubscription = {
            planId: 'trial',
            planName: 'Trial Plan',
            status: 'active',
            startDate: now,
            endDate: Timestamp.fromDate(trialEndDate),
            isTrial: true,
            currency: 'XAF',
            amount: 0,
            isYearly: false,
            autoRenew: false,
            createdAt: now,
            updatedAt: now,
        };

        // Update pharmacy document with trial subscription
        await db.collection('pharmacies').doc(pharmacyId).update({
            subscription: trialSubscription,
            updatedAt: now,
        });

        logger.info(`Trial subscription granted to ${email} (${pharmacyId})`);

        res.status(200).json({
            success: true,
            message: 'Trial subscription granted',
            pharmacyId: pharmacyId,
            email: email,
            trialEndsAt: trialEndDate.toISOString(),
            daysRemaining: 30,
        });

    } catch (error) {
        logger.error('Error granting trial subscription:', error);
        res.status(500).json({
            error: 'Failed to grant trial subscription',
            details: error.message,
        });
    }
});
