import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  deleteDoc,
  documentId,
  Timestamp,
  addDoc,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { Community, User, CommunitySettings, ChatRoomId, RoomSettings } from '../types';
import { APP_CONFIG, getRoomConfig } from '../constants/config';
import { sendSystemMessage } from './chat';
import { toDate } from '../utils/formatters';

// Helper function to initialize library with sample items
const initializeLibraryItems = async (createdBy: string): Promise<void> => {
  try {
    const sampleItems = [
      {
        title: 'Welcome Training',
        description: 'Get started with Northstar Coaching',
        category: 'training' as const,
        url: 'https://example.com/welcome',
        order: 1,
        isActive: true,
        createdBy,
        createdAt: serverTimestamp(),
      },
      {
        title: 'Morning Mind Training',
        description: 'Start your day with mindfulness',
        category: 'mind_training' as const,
        url: 'https://example.com/mind-training',
        order: 2,
        isActive: true,
        createdBy,
        createdAt: serverTimestamp(),
      },
      {
        title: 'Gratitude Journal Prompt',
        description: 'Reflect on what you\'re grateful for',
        category: 'journal_prompt' as const,
        content: 'What are three things you\'re grateful for today?',
        order: 3,
        isActive: true,
        createdBy,
        createdAt: serverTimestamp(),
      },
    ];

    // Add all sample items to menuItems collection
    const menuItemsRef = collection(db, 'menuItems');
    for (const item of sampleItems) {
      await addDoc(menuItemsRef, item);
    }

    console.log('[initializeLibraryItems] Successfully created', sampleItems.length, 'sample items');
  } catch (error) {
    console.error('[initializeLibraryItems] Error creating sample items:', error);
    // Don't throw - this is non-critical
  }
};

export const initializeCommunity = async (adminId: string): Promise<void> => {
  try {
    const communityRef = doc(db, 'community', APP_CONFIG.communityId);

    // Add timeout to getDoc call
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout getting community')), 10000)
    );

    let communityDoc;
    try {
      communityDoc = await Promise.race([
        getDoc(communityRef),
        timeoutPromise
      ]) as any;
    } catch (timeoutError) {
      console.warn('Timeout or error getting community, assuming it exists:', timeoutError);
      // If we timeout, just return - assume community exists
      return;
    }

    if (!communityDoc.exists()) {
      console.log('[initializeCommunity] Creating new community...');
      const communityData: Omit<Community, 'id'> = {
        name: APP_CONFIG.communityName,
        adminId,
        adminIds: [adminId],
        memberIds: [adminId],
        memberCount: 1,
        createdAt: serverTimestamp() as any,
        settings: APP_CONFIG.defaultSettings,
      };

      await setDoc(communityRef, communityData);

      // Send welcome message to the main chat
      try {
        await sendSystemMessage(
          `Welcome to the Inner Circle! 🌟\n\nThis is your community space. Share, connect, and grow together.`,
          'inner-circle'
        );
      } catch (error) {
        console.error('[initializeCommunity] Error sending welcome message:', error);
      }

      // Auto-populate library with sample items for new communities
      console.log('[initializeCommunity] Creating sample library items...');
      await initializeLibraryItems(adminId);
    } else {
      // Community exists, add user to memberIds if not already there
      const data = communityDoc.data();
      if (!data.memberIds?.includes(adminId)) {
        await updateDoc(communityRef, {
          memberIds: arrayUnion(adminId),
          memberCount: increment(1)
        });
      }
    }
  } catch (error) {
    console.error('Error initializing community:', error);
    // Don't throw - allow profile creation to succeed even if community update fails
    console.warn('Continuing despite community initialization error');
  }
};

export const getCommunity = async (): Promise<Community | null> => {
  try {
    // Use REST API for reliability on Vercel (Firestore SDK getDoc can fail)
    const currentUser = auth.currentUser;
    const projectId = 'northstar-community';
    const communityId = APP_CONFIG.communityId;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/community/${communityId}`;

    const headers: Record<string, string> = {};
    if (currentUser) {
      const token = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Bound the request with a timeout. A raw fetch has no timeout and will
    // hang forever on a stalled connection — which left the admin panel's
    // loadData() (and getMembers, which calls this) spinning indefinitely.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    let response: Response;
    try {
      response = await fetch(url, { headers, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.warn('[getCommunity] REST API returned:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data.fields) {
      console.warn('[getCommunity] No fields in response');
      return null;
    }

    // Parse memberIds array
    const memberIdsValues = data.fields.memberIds?.arrayValue?.values || [];
    const memberIds = memberIdsValues.map((v: any) => v.stringValue).filter(Boolean);

    // Parse adminIds array
    const adminIdsValues = data.fields.adminIds?.arrayValue?.values || [];
    const adminIds = adminIdsValues.map((v: any) => v.stringValue).filter(Boolean);

    // Parse settings map
    const settingsFields = data.fields.settings?.mapValue?.fields || {};
    const allowedSpeakersValues = settingsFields.allowedSpeakers?.arrayValue?.values || [];
    const allowedSpeakers = allowedSpeakersValues.map((v: any) => v.stringValue).filter(Boolean);

    const community: Community = {
      id: communityId,
      name: data.fields.name?.stringValue || '',
      adminId: data.fields.adminId?.stringValue || '',
      adminIds: adminIds.length > 0 ? adminIds : [data.fields.adminId?.stringValue || ''],
      memberIds,
      memberCount: parseInt(data.fields.memberCount?.integerValue || '0', 10),
      createdAt: data.fields.createdAt?.timestampValue
        ? Timestamp.fromDate(new Date(data.fields.createdAt.timestampValue))
        : Timestamp.now(),
      settings: {
        maxMembers: parseInt(settingsFields.maxMembers?.integerValue || '500', 10),
        allowMedia: settingsFields.allowMedia?.booleanValue ?? true,
        allowLinks: settingsFields.allowLinks?.booleanValue ?? true,
        chatLocked: settingsFields.chatLocked?.booleanValue ?? false,
        allowedSpeakers,
      },
    };

    return community;
  } catch (error) {
    console.error('[getCommunity] Error:', error);
    return null;
  }
};

export const isUserAdmin = async (userId: string): Promise<boolean> => {
  try {
    const community = await getCommunity();
    if (!community) return false;
    return community.adminIds?.includes(userId) || community.adminId === userId;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};

export const isUserMember = async (userId: string): Promise<boolean> => {
  try {
    const community = await getCommunity();
    return community?.memberIds.includes(userId) ?? false;
  } catch (error) {
    console.error('Error checking member status:', error);
    return false;
  }
};

export const addMember = async (
  adminId: string,
  userId: string,
  userName: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can add members');
    }

    const community = await getCommunity();
    if (!community) {
      throw new Error('Community not found');
    }

    if (community.memberIds.includes(userId)) {
      throw new Error('User is already a member');
    }

    if (community.memberCount >= community.settings.maxMembers) {
      throw new Error('Community has reached maximum members');
    }

    const communityRef = doc(db, 'community', APP_CONFIG.communityId);
    await updateDoc(communityRef, {
      memberIds: arrayUnion(userId),
      memberCount: increment(1),
    });

    await sendSystemMessage(`${userName} has joined the community`);
  } catch (error) {
    console.error('Error adding member:', error);
    throw error;
  }
};

// Add a new member to the community (used during invite acceptance)
// This bypasses admin checks since it's called during the signup flow
export const addMemberToCommunity = async (
  userId: string,
  userName: string,
  contactInfo?: string,
  contactType?: 'phone' | 'email'
): Promise<void> => {
  try {
    const community = await getCommunity();
    if (!community) {
      throw new Error('Community not found');
    }

    // Check if user is already a member
    if (community.memberIds.includes(userId)) {
      console.log('User is already a member, skipping add');
      return;
    }

    const communityRef = doc(db, 'community', APP_CONFIG.communityId);
    await updateDoc(communityRef, {
      memberIds: arrayUnion(userId),
      memberCount: increment(1),
    });

    // If contact info provided, try to mark any pending invite as accepted
    if (contactInfo && contactType) {
      try {
        const { getInviteByPhone, getInviteByEmail, acceptInvite } = await import('./invites');
        const invite = contactType === 'email'
          ? await getInviteByEmail(contactInfo)
          : await getInviteByPhone(contactInfo);

        if (invite) {
          await acceptInvite(invite.id);
          console.log('Invite marked as accepted:', invite.id);
        }
      } catch (inviteError) {
        // Don't fail the whole operation if invite acceptance fails
        console.warn('Failed to accept invite:', inviteError);
      }
    }

    await sendSystemMessage(`${userName} has joined the community`);
  } catch (error) {
    console.error('Error adding member to community:', error);
    throw error;
  }
};

export const removeMember = async (
  adminId: string,
  userId: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can remove members');
    }

    if (adminId === userId) {
      throw new Error('Admin cannot remove themselves');
    }

    const communityRef = doc(db, 'community', APP_CONFIG.communityId);
    await updateDoc(communityRef, {
      memberIds: arrayRemove(userId),
      memberCount: increment(-1),
    });

    // Note: We intentionally don't send a system message when members are removed
    // to keep departures private
  } catch (error) {
    console.error('Error removing member:', error);
    throw error;
  }
};

export const getMembers = async (): Promise<User[]> => {
  try {
    const community = await getCommunity();
    if (!community || !community.memberIds.length) {
      return [];
    }

    // Firestore 'in' queries are limited to 30 items, so we batch the requests
    const BATCH_SIZE = 30;
    const memberIds = community.memberIds;
    const members: User[] = [];

    // Process member IDs in batches of 30
    for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
      const batchIds = memberIds.slice(i, i + BATCH_SIZE);
      const usersRef = collection(db, 'users');
      const batchQuery = query(usersRef, where(documentId(), 'in', batchIds));
      const snapshot = await getDocs(batchQuery);

      snapshot.docs.forEach((userDoc) => {
        members.push({ id: userDoc.id, ...userDoc.data() } as User);
      });
    }

    return members.sort((a, b) => {
      if (a.role === 'admin') return -1;
      if (b.role === 'admin') return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  } catch (error) {
    console.error('Error getting members:', error);
    return [];
  }
};

export const findUserByPhone = async (
  phoneNumber: string
): Promise<User | null> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('phoneNumber', '==', phoneNumber));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const userDoc = snapshot.docs[0];
    return { id: userDoc.id, ...userDoc.data() } as User;
  } catch (error) {
    console.error('Error finding user by phone:', error);
    return null;
  }
};

export const updateCommunitySettings = async (
  adminId: string,
  settings: Partial<CommunitySettings>
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can update settings');
    }

    // Get current settings and merge with new ones
    const community = await getCommunity();
    if (!community) {
      throw new Error('Community not found');
    }

    const communityRef = doc(db, 'community', APP_CONFIG.communityId);
    await updateDoc(communityRef, {
      settings: { ...community.settings, ...settings },
    });
  } catch (error) {
    console.error('Error updating community settings:', error);
    throw error;
  }
};

// Ensure chat control settings exist in community document
export const ensureChatControlSettings = async (): Promise<void> => {
  try {
    const community = await getCommunity();
    if (!community) return;

    // Check if chatLocked or allowedSpeakers are missing
    const needsUpdate =
      community.settings.chatLocked === undefined ||
      community.settings.allowedSpeakers === undefined;

    if (needsUpdate) {
      const communityRef = doc(db, 'community', APP_CONFIG.communityId);
      await updateDoc(communityRef, {
        'settings.chatLocked': community.settings.chatLocked ?? false,
        'settings.allowedSpeakers': community.settings.allowedSpeakers ?? [],
      });
    }
  } catch (error) {
    console.error('Error ensuring chat control settings:', error);
    // Don't throw - this is a migration helper
  }
};

// Lock/unlock the chat (admin only mode)
export const setChatLock = async (
  adminId: string,
  locked: boolean
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can lock/unlock chat');
    }

    const community = await getCommunity();
    if (!community) {
      throw new Error('Community not found');
    }

    const communityRef = doc(db, 'community', APP_CONFIG.communityId);

    // Ensure allowedSpeakers array exists when locking
    const updateData: Record<string, any> = {
      'settings.chatLocked': locked,
    };

    // Initialize allowedSpeakers if it doesn't exist
    if (community.settings.allowedSpeakers === undefined) {
      updateData['settings.allowedSpeakers'] = [];
    }

    await updateDoc(communityRef, updateData);

    // Send system message about the change
    if (locked) {
      await sendSystemMessage('Chat has been locked. Only admin and allowed speakers can send messages.');
    } else {
      await sendSystemMessage('Chat has been unlocked. Everyone can send messages now.');
    }
  } catch (error) {
    console.error('Error setting chat lock:', error);
    throw error;
  }
};

// Add a user to allowed speakers list
export const addAllowedSpeaker = async (
  adminId: string,
  userId: string,
  userName: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can manage allowed speakers');
    }

    const community = await getCommunity();
    if (!community) {
      throw new Error('Community not found');
    }

    const communityRef = doc(db, 'community', APP_CONFIG.communityId);

    // If allowedSpeakers doesn't exist, initialize it with the user
    if (!community.settings.allowedSpeakers) {
      await updateDoc(communityRef, {
        'settings.allowedSpeakers': [userId],
      });
    } else {
      await updateDoc(communityRef, {
        'settings.allowedSpeakers': arrayUnion(userId),
      });
    }

    await sendSystemMessage(`${userName} can now send messages`);
  } catch (error) {
    console.error('Error adding allowed speaker:', error);
    throw error;
  }
};

// Remove a user from allowed speakers list
export const removeAllowedSpeaker = async (
  adminId: string,
  userId: string,
  userName: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can manage allowed speakers');
    }

    const communityRef = doc(db, 'community', APP_CONFIG.communityId);
    await updateDoc(communityRef, {
      'settings.allowedSpeakers': arrayRemove(userId),
    });

    await sendSystemMessage(`${userName}'s speaking permissions have been revoked`);
  } catch (error) {
    console.error('Error removing allowed speaker:', error);
    throw error;
  }
};

// Check if a user can send messages
export const canUserSendMessage = async (userId: string): Promise<boolean> => {
  try {
    const community = await getCommunity();
    if (!community) return false;

    // If chat is not locked, everyone can send
    if (!community.settings.chatLocked) return true;

    // Admin can always send
    if (community.adminIds?.includes(userId) || community.adminId === userId) return true;

    // Check if user is in allowed speakers list
    return community.settings.allowedSpeakers?.includes(userId) ?? false;
  } catch (error) {
    console.error('Error checking send permission:', error);
    return false;
  }
};

// Get list of allowed speakers
export const getAllowedSpeakers = async (): Promise<User[]> => {
  try {
    const community = await getCommunity();
    if (!community || !community.settings.allowedSpeakers?.length) {
      return [];
    }

    // Firestore 'in' queries are limited to 30 items, so we batch the requests
    const BATCH_SIZE = 30;
    const speakerIds = community.settings.allowedSpeakers;
    const speakers: User[] = [];

    // Process speaker IDs in batches of 30
    for (let i = 0; i < speakerIds.length; i += BATCH_SIZE) {
      const batchIds = speakerIds.slice(i, i + BATCH_SIZE);
      const usersRef = collection(db, 'users');
      const batchQuery = query(usersRef, where(documentId(), 'in', batchIds));
      const snapshot = await getDocs(batchQuery);

      snapshot.docs.forEach((userDoc) => {
        speakers.push({ id: userDoc.id, ...userDoc.data() } as User);
      });
    }

    return speakers.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (error) {
    console.error('Error getting allowed speakers:', error);
    return [];
  }
};

// ============================================
// Room-Specific Chat Lock Functions
// ============================================

// Get room-specific settings
export const getRoomSettings = async (roomId: ChatRoomId): Promise<RoomSettings> => {
  try {
    const roomSettingsRef = doc(db, 'room-settings', roomId);
    const roomSettingsDoc = await getDoc(roomSettingsRef);

    if (roomSettingsDoc.exists()) {
      return roomSettingsDoc.data() as RoomSettings;
    }

    // Return default settings if none exist
    return {
      roomId,
      chatLocked: false,
      allowedSpeakers: [],
    };
  } catch (error) {
    console.error('Error getting room settings:', error);
    return {
      roomId,
      chatLocked: false,
      allowedSpeakers: [],
    };
  }
};

// Set room-specific chat lock
export const setRoomChatLock = async (
  adminId: string,
  roomId: ChatRoomId,
  locked: boolean
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can lock/unlock chat');
    }

    const roomSettingsRef = doc(db, 'room-settings', roomId);
    const roomSettingsDoc = await getDoc(roomSettingsRef);
    const roomConfig = getRoomConfig(roomId);

    if (roomSettingsDoc.exists()) {
      await updateDoc(roomSettingsRef, { chatLocked: locked });
    } else {
      // Create the document if it doesn't exist
      await setDoc(roomSettingsRef, {
        roomId,
        chatLocked: locked,
        allowedSpeakers: [],
      });
    }

    // Send system message to the specific room
    if (locked) {
      await sendSystemMessage(`Chat has been locked. Only admin and allowed speakers can send messages.`, roomId);
    } else {
      await sendSystemMessage(`Chat has been unlocked. Everyone can send messages now.`, roomId);
    }
  } catch (error) {
    console.error('Error setting room chat lock:', error);
    throw error;
  }
};

// Add allowed speaker to a specific room
export const addRoomAllowedSpeaker = async (
  adminId: string,
  roomId: ChatRoomId,
  userId: string,
  userName: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can manage allowed speakers');
    }

    const roomSettingsRef = doc(db, 'room-settings', roomId);
    const roomSettingsDoc = await getDoc(roomSettingsRef);

    if (roomSettingsDoc.exists()) {
      await updateDoc(roomSettingsRef, {
        allowedSpeakers: arrayUnion(userId),
      });
    } else {
      // Create the document if it doesn't exist
      await setDoc(roomSettingsRef, {
        roomId,
        chatLocked: false,
        allowedSpeakers: [userId],
      });
    }

    await sendSystemMessage(`${userName} can now send messages`, roomId);
  } catch (error) {
    console.error('Error adding room allowed speaker:', error);
    throw error;
  }
};

// Remove allowed speaker from a specific room
export const removeRoomAllowedSpeaker = async (
  adminId: string,
  roomId: ChatRoomId,
  userId: string,
  userName: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can manage allowed speakers');
    }

    const roomSettingsRef = doc(db, 'room-settings', roomId);
    await updateDoc(roomSettingsRef, {
      allowedSpeakers: arrayRemove(userId),
    });

    await sendSystemMessage(`${userName}'s speaking permissions have been revoked`, roomId);
  } catch (error) {
    console.error('Error removing room allowed speaker:', error);
    throw error;
  }
};

// Check if a user can send messages in a specific room
export const canUserSendMessageInRoom = async (
  userId: string,
  roomId: ChatRoomId,
  isAdmin: boolean
): Promise<boolean> => {
  try {
    // Admin can always send
    if (isAdmin) return true;

    const roomSettings = await getRoomSettings(roomId);

    // If room is not locked, everyone can send
    if (!roomSettings.chatLocked) return true;

    // Check if user is in allowed speakers list
    return roomSettings.allowedSpeakers?.includes(userId) ?? false;
  } catch (error) {
    console.error('Error checking room send permission:', error);
    return false;
  }
};

// Get allowed speakers for a specific room
export const getRoomAllowedSpeakers = async (roomId: ChatRoomId): Promise<User[]> => {
  try {
    const roomSettings = await getRoomSettings(roomId);
    if (!roomSettings.allowedSpeakers?.length) {
      return [];
    }

    // Firestore 'in' queries are limited to 30 items, so we batch the requests
    const BATCH_SIZE = 30;
    const speakerIds = roomSettings.allowedSpeakers;
    const speakers: User[] = [];

    // Process speaker IDs in batches of 30
    for (let i = 0; i < speakerIds.length; i += BATCH_SIZE) {
      const batchIds = speakerIds.slice(i, i + BATCH_SIZE);
      const usersRef = collection(db, 'users');
      const batchQuery = query(usersRef, where(documentId(), 'in', batchIds));
      const snapshot = await getDocs(batchQuery);

      snapshot.docs.forEach((userDoc) => {
        speakers.push({ id: userDoc.id, ...userDoc.data() } as User);
      });
    }

    return speakers.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (error) {
    console.error('Error getting room allowed speakers:', error);
    return [];
  }
};

// ============================================
// Room Invite (invite-only rooms, e.g. Growth Lab)
// ============================================

export const addRoomInvitedUser = async (
  adminId: string,
  roomId: ChatRoomId,
  userId: string
): Promise<void> => {
  const isAdmin = await isUserAdmin(adminId);
  if (!isAdmin) throw new Error('Only admin can manage room invites');

  const roomSettingsRef = doc(db, 'room-settings', roomId);
  const snap = await getDoc(roomSettingsRef);

  if (snap.exists()) {
    await updateDoc(roomSettingsRef, { invitedUserIds: arrayUnion(userId) });
  } else {
    await setDoc(roomSettingsRef, {
      roomId,
      chatLocked: false,
      allowedSpeakers: [],
      invitedUserIds: [userId],
    });
  }
};

export const removeRoomInvitedUser = async (
  adminId: string,
  roomId: ChatRoomId,
  userId: string
): Promise<void> => {
  const isAdmin = await isUserAdmin(adminId);
  if (!isAdmin) throw new Error('Only admin can manage room invites');

  const roomSettingsRef = doc(db, 'room-settings', roomId);
  await updateDoc(roomSettingsRef, { invitedUserIds: arrayRemove(userId) });
};

export const transferAdmin = async (
  currentAdminId: string,
  newAdminId: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(currentAdminId);
    if (!isAdmin) {
      throw new Error('Only current admin can transfer admin role');
    }

    const isMember = await isUserMember(newAdminId);
    if (!isMember) {
      throw new Error('New admin must be a community member');
    }

    // Update community admin
    const communityRef = doc(db, 'community', APP_CONFIG.communityId);
    await updateDoc(communityRef, {
      adminId: newAdminId,
    });

    // Update user roles
    await updateDoc(doc(db, 'users', currentAdminId), {
      role: 'member',
    });
    await updateDoc(doc(db, 'users', newAdminId), {
      role: 'admin',
    });

    const newAdminDoc = await getDoc(doc(db, 'users', newAdminId));
    const newAdminName = newAdminDoc.data()?.displayName || 'A member';

    await sendSystemMessage(`${newAdminName} is now the community admin`);
  } catch (error) {
    console.error('Error transferring admin:', error);
    throw error;
  }
};

// ============================================
// Multi-Admin Management
// ============================================

export const promoteToAdmin = async (
  currentAdminId: string,
  userId: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(currentAdminId);
    if (!isAdmin) {
      throw new Error('Only an admin can promote members');
    }

    const isMember = await isUserMember(userId);
    if (!isMember) {
      throw new Error('User must be a community member');
    }

    const communityRef = doc(db, 'community', APP_CONFIG.communityId);

    // Ensure adminIds array exists (migration for existing communities)
    const community = await getCommunity();
    if (community && (!community.adminIds || community.adminIds.length === 0)) {
      await updateDoc(communityRef, {
        adminIds: [community.adminId, userId],
      });
    } else {
      await updateDoc(communityRef, {
        adminIds: arrayUnion(userId),
      });
    }

    // Update user role
    await updateDoc(doc(db, 'users', userId), {
      role: 'admin',
    });

    const userDoc = await getDoc(doc(db, 'users', userId));
    const userName = userDoc.data()?.displayName || 'A member';

    await sendSystemMessage(`${userName} has been promoted to admin`);
  } catch (error) {
    console.error('Error promoting to admin:', error);
    throw error;
  }
};

export const demoteFromAdmin = async (
  currentAdminId: string,
  userId: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(currentAdminId);
    if (!isAdmin) {
      throw new Error('Only an admin can demote other admins');
    }

    const community = await getCommunity();
    if (!community) {
      throw new Error('Community not found');
    }

    // Cannot demote the owner (original admin)
    if (community.adminId === userId) {
      throw new Error('Cannot demote the community owner');
    }

    const communityRef = doc(db, 'community', APP_CONFIG.communityId);
    await updateDoc(communityRef, {
      adminIds: arrayRemove(userId),
    });

    // Update user role back to member
    await updateDoc(doc(db, 'users', userId), {
      role: 'member',
    });

    const userDoc = await getDoc(doc(db, 'users', userId));
    const userName = userDoc.data()?.displayName || 'A member';

    await sendSystemMessage(`${userName} has been removed as admin`);
  } catch (error) {
    console.error('Error demoting from admin:', error);
    throw error;
  }
};

// ============================================
// Standard (Northstar Coaching) Access Management
// ============================================

// Grant Standard access to a user (Northstar Coaching chat)
export const grantStandardAccess = async (
  adminId: string,
  userId: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can grant Standard access');
    }

    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    await updateDoc(userRef, {
      subscriptionTier: 'standard',
      subscriptionStatus: 'active',
    });

    // Update subscription document
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const subscriptionRef = doc(db, 'subscriptions', userId);
    await setDoc(subscriptionRef, {
      tier: 'standard',
      status: 'active',
      startDate: Timestamp.fromDate(now),
      currentPeriodEnd: Timestamp.fromDate(nextMonth),
      stripeCustomerId: 'manual_upgrade',
      stripePriceId: 'price_standard',
      updatedAt: Timestamp.fromDate(now),
    }, { merge: true });

  } catch (error) {
    console.error('Error granting Standard access:', error);
    throw error;
  }
};

// Revoke Standard access from a user
export const revokeStandardAccess = async (
  adminId: string,
  userId: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can revoke Standard access');
    }

    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    await updateDoc(userRef, {
      subscriptionTier: 'none',
      subscriptionStatus: 'inactive',
    });
  } catch (error) {
    console.error('Error revoking Standard access:', error);
    throw error;
  }
};

// ============================================
// Inner Circle Access Management
// ============================================

// Grant Elite access to a user
export const grantEliteAccess = async (
  adminId: string,
  userId: string,
  expiryDate?: Date
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can grant Elite access');
    }

    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    const updateData: Record<string, any> = {
      hasEliteAccess: true,
      subscriptionTier: 'all-access',
      subscriptionStatus: 'active',
    };

    if (expiryDate) {
      updateData.eliteAccessExpiry = Timestamp.fromDate(expiryDate);
    } else {
      // If no expiry provided, remove any existing expiry (permanent access)
      updateData.eliteAccessExpiry = null;
    }

    await updateDoc(userRef, updateData);

    // Update subscription document
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const subscriptionRef = doc(db, 'subscriptions', userId);
    await setDoc(subscriptionRef, {
      tier: 'all-access',
      status: 'active',
      startDate: Timestamp.fromDate(now),
      currentPeriodEnd: expiryDate ? Timestamp.fromDate(expiryDate) : Timestamp.fromDate(nextMonth),
      stripeCustomerId: 'manual_upgrade',
      stripePriceId: 'price_elite',
      updatedAt: Timestamp.fromDate(now),
    }, { merge: true });

    const userName = userDoc.data()?.displayName || 'A member';

    // Send personalized welcome message to the Inner Circle chat
    const welcomeMessage = `Welcome, @${userName} ✨
You've entered the Inner Circle.
We're so glad you're here.

When you're ready, please introduce yourself to the community by sharing:

✨ One thing you're currently manifesting

📍 The city you're living in

🌙 Your sun, moon, and rising signs (if you know them)

This space is intentional, high-frequency, and deeply supportive.
We're honored to have you inside.`;

    await sendSystemMessage(welcomeMessage, 'inner-circle');
  } catch (error) {
    console.error('Error granting Elite access:', error);
    throw error;
  }
};

// Revoke Elite access from a user
export const revokeEliteAccess = async (
  adminId: string,
  userId: string
): Promise<void> => {
  try {
    const isAdmin = await isUserAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Only admin can revoke Elite access');
    }

    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    await updateDoc(userRef, {
      hasEliteAccess: false,
      eliteAccessExpiry: null,
      subscriptionTier: 'standard',
    });
  } catch (error) {
    console.error('Error revoking Elite access:', error);
    throw error;
  }
};

// Check if a user has valid Elite access
export const checkEliteAccess = async (userId: string): Promise<boolean> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return false;
    }

    const userData = userDoc.data();

    // No Elite access granted
    if (!userData.hasEliteAccess) {
      return false;
    }

    // Check if access has expired
    if (userData.eliteAccessExpiry) {
      const expiryDate = toDate(userData.eliteAccessExpiry);
      if (expiryDate && expiryDate < new Date()) {
        // Access has expired - revoke it
        await updateDoc(userRef, {
          hasEliteAccess: false,
        });
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error checking Elite access:', error);
    return false;
  }
};

// Get all users with Elite access
export const getEliteMembers = async (): Promise<User[]> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('hasEliteAccess', '==', true));
    const snapshot = await getDocs(q);

    const eliteMembers: User[] = [];
    snapshot.docs.forEach((userDoc) => {
      eliteMembers.push({ id: userDoc.id, ...userDoc.data() } as User);
    });

    return eliteMembers.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (error) {
    console.error('Error getting Elite members:', error);
    return [];
  }
};
