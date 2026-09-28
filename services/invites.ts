import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { ensureFirestoreReady } from './firestore-init';
import { APP_CONFIG } from '../constants/config';

export interface Invite {
  id: string;
  phoneNumber?: string; // Optional - use phone or email
  email?: string; // Optional - use phone or email
  inviteType: 'phone' | 'email';
  invitedBy: string;
  invitedByName: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: Timestamp;
  expiresAt: Timestamp;
  inviteCode: string;
}

// Generate a random 6-character invite code using cryptographic randomness
const generateInviteCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0, O, 1, I
  const randomValues = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomValues);
  } else {
    // Fallback for environments without Web Crypto API
    for (let i = 0; i < 6; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(randomValues[i] % chars.length);
  }
  return code;
};

// Create a new invite (phone)
export const createInvite = async (
  phoneNumber: string,
  invitedBy: string,
  invitedByName: string
): Promise<Invite> => {
  try {
    // Ensure Firestore is ready
    await ensureFirestoreReady();

    // Check if there's already a pending invite for this phone number
    const existingInvite = await getInviteByPhone(phoneNumber);
    if (existingInvite && existingInvite.status === 'pending') {
      throw new Error('An invite has already been sent to this phone number');
    }

    const inviteCode = generateInviteCode();

    // Invite expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const inviteData = {
      phoneNumber,
      inviteType: 'phone' as const,
      invitedBy,
      invitedByName,
      status: 'pending' as const,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      inviteCode,
    };

    const docRef = await addDoc(collection(db, 'invites'), inviteData);

    return {
      id: docRef.id,
      ...inviteData,
      createdAt: Timestamp.now(),
    } as Invite;
  } catch (error) {
    console.error('Error creating invite:', error);
    throw error;
  }
};

// Create a new invite (email)
export const createEmailInvite = async (
  email: string,
  invitedBy: string,
  invitedByName: string
): Promise<Invite> => {
  try {
    // Ensure Firestore is ready
    await ensureFirestoreReady();

    // Check if there's already a pending invite for this email
    const existingInvite = await getInviteByEmail(email);
    if (existingInvite && existingInvite.status === 'pending') {
      throw new Error('An invite has already been sent to this email address');
    }

    const inviteCode = generateInviteCode();

    // Invite expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const inviteData = {
      email: email.toLowerCase(),
      inviteType: 'email' as const,
      invitedBy,
      invitedByName,
      status: 'pending' as const,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      inviteCode,
    };

    const docRef = await addDoc(collection(db, 'invites'), inviteData);

    return {
      id: docRef.id,
      ...inviteData,
      createdAt: Timestamp.now(),
    } as Invite;
  } catch (error) {
    console.error('Error creating email invite:', error);
    throw error;
  }
};

// Get invite by phone number
export const getInviteByPhone = async (phoneNumber: string): Promise<Invite | null> => {
  try {
    const q = query(
      collection(db, 'invites'),
      where('phoneNumber', '==', phoneNumber),
      where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Invite;
  } catch (error) {
    console.error('Error getting invite by phone:', error);
    return null;
  }
};

// Get invite by email
export const getInviteByEmail = async (email: string): Promise<Invite | null> => {
  try {
    const q = query(
      collection(db, 'invites'),
      where('email', '==', email.toLowerCase()),
      where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Invite;
  } catch (error) {
    console.error('Error getting invite by email:', error);
    return null;
  }
};

// Get invite by code
// NOTE: Due to Firestore security rules protecting PII, this function now uses
// a Cloud Function for unauthenticated validation
export const getInviteByCode = async (inviteCode: string): Promise<Invite | null> => {
  try {
    // Call the Cloud Function to validate the invite code
    const response = await fetch(
      `https://us-central1-${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/validateInviteCode`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inviteCode: inviteCode.toUpperCase() }),
      }
    );

    const result = await response.json();

    if (!result.valid) {
      return null;
    }

    // Return a minimal invite object (no PII)
    // The actual invite will be fetched after user authenticates
    return {
      id: '', // Will be populated after auth
      inviteCode: inviteCode.toUpperCase(),
      inviteType: result.inviteType,
      invitedByName: result.invitedByName || 'Admin',
      status: 'pending',
      invitedBy: '', // Hidden for security
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.now(),
    } as Invite;
  } catch (error) {
    console.error('Error validating invite code:', error);
    return null;
  }
};

// Accept an invite
export const acceptInvite = async (inviteId: string): Promise<void> => {
  try {
    const inviteRef = doc(db, 'invites', inviteId);
    await updateDoc(inviteRef, {
      status: 'accepted',
    });
  } catch (error) {
    console.error('Error accepting invite:', error);
    throw error;
  }
};

// Get all pending invites (for admin)
export const getPendingInvites = async (): Promise<Invite[]> => {
  try {
    const q = query(
      collection(db, 'invites'),
      where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Invite[];
  } catch (error) {
    console.error('Error getting pending invites:', error);
    return [];
  }
};

// Cancel/delete an invite
export const cancelInvite = async (inviteId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'invites', inviteId));
  } catch (error) {
    console.error('Error canceling invite:', error);
    throw error;
  }
};

// Generate the invite link
export const generateInviteLink = (inviteCode: string): string => {
  // In production, this would be your actual domain
  // For now, we'll use a placeholder that can be configured
  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://community.example.com';

  return `${baseUrl}/invite/${inviteCode}`;
};

// Generate SMS message content
export const generateInviteMessage = (
  inviterName: string,
  inviteCode: string
): string => {
  const link = generateInviteLink(inviteCode);
  return `${inviterName} has invited you to join Northstar Community! Use code ${inviteCode} or click here to join: ${link}`;
};

// Generate email invite message content
export const generateEmailInviteMessage = (
  inviterName: string,
  inviteCode: string
): string => {
  const link = generateInviteLink(inviteCode);
  return `${inviterName} has invited you to join Northstar Community!\n\nYour invite code is: ${inviteCode}\n\nClick here to join: ${link}\n\nThis invite will expire in 7 days.`;
};
