import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Subscription, SubscriptionTier, SubscriptionStatus, SubscriptionHistory, User } from '../types';

// Stripe Price IDs - These should be set in environment variables in production
const STRIPE_PRICE_IDS = {
  standard: process.env.EXPO_PUBLIC_STRIPE_PRICE_STANDARD || 'price_standard_monthly',
  'all-access': process.env.EXPO_PUBLIC_STRIPE_PRICE_ALL_ACCESS || 'price_allaccess_monthly',
};

// Stripe publishable key
export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

// Base URL for your payment API/webhook handler
const PAYMENT_API_URL = process.env.EXPO_PUBLIC_PAYMENT_API_URL || 'https://your-api.com/payment';

/**
 * Get subscription data for a user
 */
export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const subscriptionSnap = await getDoc(subscriptionRef);

    if (!subscriptionSnap.exists()) {
      return null;
    }

    return subscriptionSnap.data() as Subscription;
  } catch (error) {
    console.error('Error getting user subscription:', error);
    return null;
  }
}

/**
 * Check if user has access to a specific room based on subscription
 */
export function canAccessRoom(
  user: User | null,
  requiredTier: 'standard' | 'all-access'
): boolean {
  if (!user) return false;

  // Admins have access to everything
  if (user.role === 'admin') return true;

  // Check subscription status
  if (user.subscriptionStatus !== 'active') return false;

  // Check tier
  if (requiredTier === 'standard') {
    return user.subscriptionTier === 'standard' || user.subscriptionTier === 'all-access';
  } else if (requiredTier === 'all-access') {
    return user.subscriptionTier === 'all-access';
  }

  return false;
}

/**
 * Create Stripe checkout session for subscription
 * Returns the Stripe checkout URL
 */
export async function createCheckoutSession(
  userId: string,
  tier: SubscriptionTier,
  userEmail?: string
): Promise<string> {
  if (tier === 'none') {
    throw new Error('Cannot create checkout session for none tier');
  }

  const priceId = STRIPE_PRICE_IDS[tier];
  if (!priceId) {
    throw new Error(`No price ID configured for tier: ${tier}`);
  }

  try {
    // Call your backend API to create a Stripe checkout session
    const response = await fetch(`${PAYMENT_API_URL}/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        priceId,
        tier,
        customerEmail: userEmail,
        successUrl: `${window.location.origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/payment/cancelled`,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }

    const data = await response.json();
    return data.checkoutUrl;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
}

/**
 * Create or update subscription in Firestore
 * This is typically called by webhook after successful payment
 */
export async function createOrUpdateSubscription(
  userId: string,
  subscriptionData: Partial<Subscription>
): Promise<void> {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const now = serverTimestamp();

    await setDoc(
      subscriptionRef,
      {
        ...subscriptionData,
        userId,
        updatedAt: now,
      },
      { merge: true }
    );

    // Also update the user document
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      subscriptionTier: subscriptionData.tier || 'none',
      subscriptionStatus: subscriptionData.status || 'inactive',
      subscriptionExpiresAt: subscriptionData.currentPeriodEnd,
      stripeCustomerId: subscriptionData.stripeCustomerId,
      // Update legacy fields for backward compatibility
      hasEliteAccess: subscriptionData.tier === 'all-access' && subscriptionData.status === 'active',
      eliteAccessExpiry: subscriptionData.currentPeriodEnd,
    });

    // Log subscription history
    await logSubscriptionHistory(userId, {
      event: 'upgraded',
      tier: subscriptionData.tier || 'none',
      status: subscriptionData.status || 'inactive',
      timestamp: Timestamp.now(),
      metadata: subscriptionData,
    });
  } catch (error) {
    console.error('Error creating/updating subscription:', error);
    throw error;
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(userId: string): Promise<void> {
  try {
    // Call backend to cancel Stripe subscription
    const response = await fetch(`${PAYMENT_API_URL}/cancel-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error('Failed to cancel subscription');
    }

    // Update local subscription
    const subscriptionRef = doc(db, 'subscriptions', userId);
    await updateDoc(subscriptionRef, {
      status: 'cancelled' as SubscriptionStatus,
      cancelAtPeriodEnd: true,
      updatedAt: serverTimestamp(),
    });

    // Log history
    const subscription = await getUserSubscription(userId);
    if (subscription) {
      await logSubscriptionHistory(userId, {
        event: 'cancelled',
        tier: subscription.tier,
        status: 'cancelled',
        timestamp: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    throw error;
  }
}

/**
 * Admin function: Manually set user subscription tier
 */
export async function adminSetSubscriptionTier(
  userId: string,
  tier: SubscriptionTier,
  expiresAt?: Date
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const subscriptionRef = doc(db, 'subscriptions', userId);

    const expirationTimestamp = expiresAt ? Timestamp.fromDate(expiresAt) : undefined;
    const status: SubscriptionStatus = tier === 'none' ? 'inactive' : 'active';

    // Update user document
    await updateDoc(userRef, {
      subscriptionTier: tier,
      subscriptionStatus: status,
      subscriptionExpiresAt: expirationTimestamp || null,
      hasEliteAccess: tier === 'all-access' && status === 'active',
      eliteAccessExpiry: expirationTimestamp || null,
    });

    // Update subscription document
    await setDoc(
      subscriptionRef,
      {
        userId,
        tier,
        status,
        currentPeriodEnd: expirationTimestamp,
        cancelAtPeriodEnd: false,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // Log history
    await logSubscriptionHistory(userId, {
      event: tier === 'none' ? 'cancelled' : 'upgraded',
      tier,
      status,
      timestamp: Timestamp.now(),
      metadata: { adminAction: true },
    });
  } catch (error) {
    console.error('Error setting subscription tier:', error);
    throw error;
  }
}

/**
 * Log subscription history event
 */
async function logSubscriptionHistory(
  userId: string,
  historyData: Omit<SubscriptionHistory, 'id'>
): Promise<void> {
  try {
    const historyRef = doc(collection(db, 'subscriptions', userId, 'history'));
    await setDoc(historyRef, {
      ...historyData,
      id: historyRef.id,
    });
  } catch (error) {
    console.error('Error logging subscription history:', error);
    // Don't throw - this is not critical
  }
}

/**
 * Get subscription history for a user
 */
export async function getSubscriptionHistory(userId: string): Promise<SubscriptionHistory[]> {
  try {
    const historyRef = collection(db, 'subscriptions', userId, 'history');
    const snapshot = await getDocs(historyRef);

    return snapshot.docs.map(doc => doc.data() as SubscriptionHistory);
  } catch (error) {
    console.error('Error getting subscription history:', error);
    return [];
  }
}

/**
 * Check if subscription has expired and update status
 */
export async function checkAndUpdateExpiredSubscriptions(): Promise<void> {
  try {
    const subscriptionsRef = collection(db, 'subscriptions');
    const q = query(
      subscriptionsRef,
      where('status', '==', 'active'),
      where('currentPeriodEnd', '<=', Timestamp.now())
    );

    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      const subscription = docSnap.data() as Subscription;

      // Update to expired/inactive
      await updateDoc(doc(db, 'subscriptions', subscription.userId), {
        status: 'inactive' as SubscriptionStatus,
        updatedAt: serverTimestamp(),
      });

      // Update user document
      await updateDoc(doc(db, 'users', subscription.userId), {
        subscriptionStatus: 'inactive',
        hasEliteAccess: false,
      });

      // Log history
      await logSubscriptionHistory(subscription.userId, {
        event: 'expired',
        tier: subscription.tier,
        status: 'inactive',
        timestamp: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error('Error checking expired subscriptions:', error);
  }
}

/**
 * Get pricing information for tiers
 */
export function getPricingInfo() {
  return {
    standard: {
      tier: 'standard' as SubscriptionTier,
      name: 'Standard',
      price: '$25',
      interval: 'month',
      features: [
        'Access to Northstar Community',
        'Read messages from the coach',
        'React to messages',
        'Access to Library resources',
        'Community member profile',
      ],
    },
    'all-access': {
      tier: 'all-access' as SubscriptionTier,
      name: 'All Access',
      price: '$90',
      interval: 'month',
      features: [
        'Everything in Standard',
        'Access to Inner Circle',
        'Post messages and questions',
        'Direct interaction with the coach',
        'Exclusive content and events',
        'Priority support',
      ],
      recommended: true,
    },
  };
}
