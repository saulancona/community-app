import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { User } from '../types';

// Block a user
export const blockUser = async (
  currentUserId: string,
  userIdToBlock: string
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', currentUserId);
    await updateDoc(userRef, {
      blockedUsers: arrayUnion(userIdToBlock),
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    throw error;
  }
};

// Unblock a user
export const unblockUser = async (
  currentUserId: string,
  userIdToUnblock: string
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', currentUserId);
    await updateDoc(userRef, {
      blockedUsers: arrayRemove(userIdToUnblock),
    });
  } catch (error) {
    console.error('Error unblocking user:', error);
    throw error;
  }
};

// Mute a user (no notifications from them)
export const muteUser = async (
  currentUserId: string,
  userIdToMute: string
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', currentUserId);
    await updateDoc(userRef, {
      mutedUsers: arrayUnion(userIdToMute),
    });
  } catch (error) {
    console.error('Error muting user:', error);
    throw error;
  }
};

// Unmute a user
export const unmuteUser = async (
  currentUserId: string,
  userIdToUnmute: string
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', currentUserId);
    await updateDoc(userRef, {
      mutedUsers: arrayRemove(userIdToUnmute),
    });
  } catch (error) {
    console.error('Error unmuting user:', error);
    throw error;
  }
};

// Check if a user is blocked
export const isUserBlocked = async (
  currentUserId: string,
  otherUserId: string
): Promise<boolean> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', currentUserId));
    if (!userDoc.exists()) return false;

    const userData = userDoc.data() as User;
    return userData.blockedUsers?.includes(otherUserId) || false;
  } catch (error) {
    console.error('Error checking blocked status:', error);
    return false;
  }
};

// Check if a user is muted
export const isUserMuted = async (
  currentUserId: string,
  otherUserId: string
): Promise<boolean> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', currentUserId));
    if (!userDoc.exists()) return false;

    const userData = userDoc.data() as User;
    return userData.mutedUsers?.includes(otherUserId) || false;
  } catch (error) {
    console.error('Error checking muted status:', error);
    return false;
  }
};

// Get list of blocked user IDs
export const getBlockedUsers = async (userId: string): Promise<string[]> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return [];

    const userData = userDoc.data() as User;
    return userData.blockedUsers || [];
  } catch (error) {
    console.error('Error getting blocked users:', error);
    return [];
  }
};

// Get list of muted user IDs
export const getMutedUsers = async (userId: string): Promise<string[]> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return [];

    const userData = userDoc.data() as User;
    return userData.mutedUsers || [];
  } catch (error) {
    console.error('Error getting muted users:', error);
    return [];
  }
};

/**
 * Update user profile fields
 * @param userId - The user's ID
 * @param updates - Object containing fields to update
 */
export const updateUserProfile = async (
  userId: string,
  updates: Partial<{
    displayName: string;
    avatarUrl: string;
    bio: string;
  }>
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw new Error('Failed to update profile');
  }
};

/**
 * Get user profile by ID
 * @param userId - The user's ID
 * @returns User profile data
 */
export const getUserProfile = async (userId: string): Promise<User | null> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return null;
    }

    return { id: userDoc.id, ...userDoc.data() } as User;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};
