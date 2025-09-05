import { onRequest } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { sendValidationError, sendError, BusinessErrors } from "./lib/validation.js";

// Initialize Firebase Admin if not already done
if (getApps().length === 0) initializeApp();
const db = getFirestore();

// 🔒 SUBSCRIPTION SECURITY FUNCTIONS (CRITICAL FOR REVENUE PROTECTION)

// Helper function to get and validate subscription status
async function getValidSubscription(userId: string) {
  const pharmacyDoc = await db.collection("pharmacies").doc(userId).get();
  
  if (!pharmacyDoc.exists) {
    throw BusinessErrors.USER_NOT_FOUND(userId);
  }
  
  const pharmacy = pharmacyDoc.data() as any;
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
export const validateInventoryAccess = onRequest({ region: "europe-west1", cors: true }, async (req, res) => {
  try {
    const userId = req.query?.userId as string | undefined;
    
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
        return;
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

  } catch (error: any) {
    sendError(res, error);
  }
});

// Validate proposal creation (server-side enforcement) 
export const validateProposalAccess = onRequest({ region: "europe-west1", cors: true }, async (req, res) => {
  try {
    const userId = req.query?.userId as string | undefined;
    
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

  } catch (error: any) {
    sendError(res, error);
  }
});

// Get comprehensive subscription status (server-side truth source)
export const getSubscriptionStatus = onRequest({ region: "europe-west1", cors: true }, async (req, res) => {
  try {
    const userId = req.query?.userId as string | undefined;
    
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

  } catch (error: any) {
    sendError(res, error);
  }
});