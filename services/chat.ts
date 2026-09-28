import {
  collection,
  doc,
  addDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  QueryDocumentSnapshot,
  DocumentData,
  Unsubscribe,
  writeBatch,
  getDocs,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db, callFunction } from './firebase';
import { Message, ChatRoomId } from '../types';
import { APP_CONFIG, getRoomConfig } from '../constants/config';

// Flag to enable/disable secure cloud functions
// Functions are deployed and active
const USE_SECURE_FUNCTIONS = true;

// Default collection for backwards compatibility
const DEFAULT_COLLECTION = 'messages';

// Get the collection name for a room
const getCollectionName = (roomId?: ChatRoomId): string => {
  if (!roomId) return DEFAULT_COLLECTION;
  return getRoomConfig(roomId).messagesCollection;
};

interface ReplyTo {
  id: string;
  content: string;
  senderName: string;
  type: 'text' | 'image' | 'video' | 'voice';
}

export const sendMessage = async (
  senderId: string,
  senderName: string,
  content: string,
  senderAvatar?: string,
  replyTo?: ReplyTo,
  roomId?: ChatRoomId
): Promise<string> => {
  try {
    // Use secure cloud function if enabled
    if (USE_SECURE_FUNCTIONS) {
      const result = await callFunction<{ success: boolean; messageId: string }>(
        'sendMessageSecure',
        {
          content,
          roomId,
          replyTo,
          senderName,
          senderAvatar,
        }
      );
      return result.messageId;
    }

    // Fallback to direct Firestore write (with client-side validation)
    const collectionName = getCollectionName(roomId);

    // Build message data, excluding undefined fields (Firestore doesn't accept undefined)
    const messageData: Record<string, any> = {
      senderId,
      senderName,
      content,
      type: 'text',
      timestamp: serverTimestamp(),
      readBy: [senderId],
    };

    // Only add senderAvatar if it's defined
    if (senderAvatar) {
      messageData.senderAvatar = senderAvatar;
    }

    // Add reply data if replying to a message
    if (replyTo) {
      messageData.replyTo = replyTo;
    }

    const docRef = await addDoc(collection(db, collectionName), messageData);
    return docRef.id;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

export const sendSystemMessage = async (content: string, roomId?: ChatRoomId): Promise<string> => {
  try {
    const collectionName = getCollectionName(roomId);
    const messageData: Omit<Message, 'id'> = {
      senderId: 'system',
      senderName: 'System',
      content,
      type: 'system',
      timestamp: serverTimestamp() as any,
    };

    const docRef = await addDoc(collection(db, collectionName), messageData);
    return docRef.id;
  } catch (error) {
    console.error('Error sending system message:', error);
    throw error;
  }
};

export const sendImageMessage = async (
  senderId: string,
  senderName: string,
  imageUrl: string,
  imageWidth?: number,
  imageHeight?: number,
  senderAvatar?: string,
  roomId?: ChatRoomId,
  imageData?: string,
  imageContentType?: string
): Promise<string> => {
  try {
    // Use secure cloud function if enabled
    if (USE_SECURE_FUNCTIONS) {
      const payload: Record<string, any> = {
        imageWidth,
        imageHeight,
        roomId,
        senderName,
        senderAvatar,
      };

      // Prefer server-side upload (base64) to bypass CORS/iframe issues
      if (imageData) {
        payload.imageData = imageData;
        payload.imageContentType = imageContentType;
      } else {
        payload.imageUrl = imageUrl;
      }

      const result = await callFunction<{ success: boolean; messageId: string }>(
        'sendImageMessageSecure',
        payload
      );
      return result.messageId;
    }

    // Fallback to direct Firestore write
    const collectionName = getCollectionName(roomId);
    const messageData: Record<string, any> = {
      senderId,
      senderName,
      content: '',
      type: 'image',
      imageUrl,
      timestamp: serverTimestamp(),
      readBy: [senderId],
    };

    if (imageWidth) messageData.imageWidth = imageWidth;
    if (imageHeight) messageData.imageHeight = imageHeight;
    if (senderAvatar) messageData.senderAvatar = senderAvatar;

    const docRef = await addDoc(collection(db, collectionName), messageData);
    return docRef.id;
  } catch (error) {
    console.error('Error sending image message:', error);
    throw error;
  }
};

export const sendVideoMessage = async (
  senderId: string,
  senderName: string,
  videoUrl: string,
  videoDuration?: number,
  senderAvatar?: string,
  roomId?: ChatRoomId
): Promise<string> => {
  try {
    if (USE_SECURE_FUNCTIONS) {
      const payload: Record<string, any> = {
        videoUrl,
        videoDuration,
        roomId,
        senderName,
        senderAvatar,
      };

      const result = await callFunction<{ success: boolean; messageId: string }>(
        'sendVideoMessageSecure',
        payload
      );
      return result.messageId;
    }

    // Fallback to direct Firestore write
    const collectionName = getCollectionName(roomId);
    const messageData: Record<string, any> = {
      senderId,
      senderName,
      content: '',
      type: 'video',
      videoUrl,
      timestamp: serverTimestamp(),
      readBy: [senderId],
    };

    if (videoDuration) messageData.videoDuration = videoDuration;
    if (senderAvatar) messageData.senderAvatar = senderAvatar;

    const docRef = await addDoc(collection(db, collectionName), messageData);
    return docRef.id;
  } catch (error) {
    console.error('Error sending video message:', error);
    throw error;
  }
};

export const sendVoiceMessage = async (
  senderId: string,
  senderName: string,
  audioUrl: string,
  audioDuration: number,
  senderAvatar?: string,
  roomId?: ChatRoomId
): Promise<string> => {
  try {
    const collectionName = getCollectionName(roomId);
    const messageData: Record<string, any> = {
      senderId,
      senderName,
      content: '',
      type: 'voice',
      audioUrl,
      audioDuration,
      timestamp: serverTimestamp(),
      readBy: [senderId],
    };

    if (senderAvatar) messageData.senderAvatar = senderAvatar;

    const docRef = await addDoc(collection(db, collectionName), messageData);
    return docRef.id;
  } catch (error) {
    console.error('Error sending voice message:', error);
    throw error;
  }
};

export interface MessageSubscriptionResult {
  messages: Message[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export const subscribeToMessages = (
  callback: (result: MessageSubscriptionResult) => void,
  onError?: (error: Error) => void,
  roomId?: ChatRoomId,
): Unsubscribe => {
  const collectionName = getCollectionName(roomId);
  const q = query(
    collection(db, collectionName),
    orderBy('timestamp', 'desc'),
    limit(APP_CONFIG.messagesPerPage)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const messages: Message[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Message[];

      const lastDoc = snapshot.docs.length > 0
        ? snapshot.docs[snapshot.docs.length - 1]
        : null;

      callback({
        messages,
        lastDoc,
        hasMore: snapshot.docs.length === APP_CONFIG.messagesPerPage,
      });
    },
    (error) => {
      console.error('Error in messages subscription:', error);
      // Return empty result on error to prevent crash
      callback({
        messages: [],
        lastDoc: null,
        hasMore: false,
      });
      if (onError) {
        onError(error);
      }
    }
  );
};

export const fetchMoreMessages = async (
  lastDoc: QueryDocumentSnapshot<DocumentData>,
  roomId?: ChatRoomId
): Promise<MessageSubscriptionResult> => {
  const collectionName = getCollectionName(roomId);
  const q = query(
    collection(db, collectionName),
    orderBy('timestamp', 'desc'),
    startAfter(lastDoc),
    limit(APP_CONFIG.messagesPerPage)
  );

  const snapshot = await getDocs(q);
  const messages: Message[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Message[];

  const newLastDoc = snapshot.docs.length > 0
    ? snapshot.docs[snapshot.docs.length - 1]
    : null;

  return {
    messages,
    lastDoc: newLastDoc,
    hasMore: snapshot.docs.length === APP_CONFIG.messagesPerPage,
  };
};

// Debounce timer for batching read receipts (per room)
const readReceiptTimers: Record<string, ReturnType<typeof setTimeout> | null> = {};
const pendingReadReceipts: Record<string, { messageIds: string[]; userId: string; collectionName: string }> = {};

// Optimized: batch write read receipts with debouncing
const executeBatchReadReceipts = async (roomKey: string) => {
  const pending = pendingReadReceipts[roomKey];
  if (!pending || pending.messageIds.length === 0) {
    return;
  }

  const { messageIds, userId, collectionName } = pending;
  delete pendingReadReceipts[roomKey];

  try {
    // Firestore batches can only handle 500 operations at once
    const BATCH_SIZE = 500;
    const batches = [];

    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = messageIds.slice(i, i + BATCH_SIZE);

      chunk.forEach((messageId) => {
        const messageRef = doc(db, collectionName, messageId);
        batch.update(messageRef, {
          readBy: arrayUnion(userId),
        });
      });

      batches.push(batch.commit());
    }

    await Promise.all(batches);
  } catch (error) {
    console.error('Error marking messages as read:', error);
  }
};

export const markMessagesAsRead = async (
  messageIds: string[],
  userId: string,
  roomId?: ChatRoomId
): Promise<void> => {
  const collectionName = getCollectionName(roomId);
  const roomKey = collectionName + '_' + userId;

  // Merge with any pending read receipts for same user and room
  if (pendingReadReceipts[roomKey]) {
    // Add new message IDs (avoid duplicates)
    const existingIds = new Set(pendingReadReceipts[roomKey].messageIds);
    messageIds.forEach((id) => {
      if (!existingIds.has(id)) {
        pendingReadReceipts[roomKey].messageIds.push(id);
      }
    });
  } else {
    pendingReadReceipts[roomKey] = { messageIds: [...messageIds], userId, collectionName };
  }

  // Clear existing timer for this room
  if (readReceiptTimers[roomKey]) {
    clearTimeout(readReceiptTimers[roomKey]!);
  }

  // Debounce: wait 500ms before executing to batch multiple calls
  readReceiptTimers[roomKey] = setTimeout(() => {
    executeBatchReadReceipts(roomKey);
    readReceiptTimers[roomKey] = null;
  }, 500);
};

// Search messages locally (client-side filtering)
// Note: Firestore doesn't support full-text search natively
// For production, consider using Algolia or Elasticsearch
export const searchMessages = (
  messages: Message[],
  searchQuery: string
): Message[] => {
  if (!searchQuery.trim()) {
    return [];
  }

  const query = searchQuery.toLowerCase().trim();

  return messages.filter((message) => {
    // Only search text messages
    if (message.type !== 'text') {
      return false;
    }

    // Search in message content
    if (message.content.toLowerCase().includes(query)) {
      return true;
    }

    // Search in sender name
    if (message.senderName.toLowerCase().includes(query)) {
      return true;
    }

    return false;
  });
};

// Available reaction emojis
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '‼️'];

// Soft delete a message (keeps record for audit, but hides content)
export const deleteMessage = async (
  messageId: string,
  userId: string,
  isAdmin: boolean = false,
  roomId?: ChatRoomId
): Promise<void> => {
  try {
    const collectionName = getCollectionName(roomId);
    const messageRef = doc(db, collectionName, messageId);
    const messageSnap = await getDoc(messageRef);

    if (!messageSnap.exists()) {
      throw new Error('Message not found');
    }

    const messageData = messageSnap.data();

    // Only allow deletion by the sender or an admin
    if (messageData.senderId !== userId && !isAdmin) {
      throw new Error('Not authorized to delete this message');
    }

    // Soft delete - keep the message but mark as deleted
    await updateDoc(messageRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: userId,
      // Clear sensitive content but keep metadata
      content: '',
      imageUrl: null,
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
};

// Restore a soft-deleted message (admin only)
export const restoreMessage = async (
  messageId: string,
  isAdmin: boolean,
  roomId?: ChatRoomId
): Promise<void> => {
  if (!isAdmin) {
    throw new Error('Only admins can restore messages');
  }

  try {
    const collectionName = getCollectionName(roomId);
    const messageRef = doc(db, collectionName, messageId);
    await updateDoc(messageRef, {
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });
  } catch (error) {
    console.error('Error restoring message:', error);
    throw error;
  }
};

// Edit a message (only the sender can edit within a time window)
const EDIT_TIME_LIMIT_MS = 15 * 60 * 1000; // 15 minutes

export const editMessage = async (
  messageId: string,
  userId: string,
  newContent: string,
  roomId?: ChatRoomId
): Promise<void> => {
  try {
    const collectionName = getCollectionName(roomId);
    const messageRef = doc(db, collectionName, messageId);
    const messageSnap = await getDoc(messageRef);

    if (!messageSnap.exists()) {
      throw new Error('Message not found');
    }

    const messageData = messageSnap.data();

    // Only the sender can edit
    if (messageData.senderId !== userId) {
      throw new Error('Not authorized to edit this message');
    }

    // Can only edit text messages
    if (messageData.type !== 'text') {
      throw new Error('Only text messages can be edited');
    }

    // Check time limit for editing
    const messageTime = messageData.timestamp?.toDate?.()?.getTime?.() || 0;
    const now = Date.now();
    if (now - messageTime > EDIT_TIME_LIMIT_MS) {
      throw new Error('Message can no longer be edited (15 minute limit exceeded)');
    }

    // Check if message is deleted
    if (messageData.isDeleted) {
      throw new Error('Cannot edit a deleted message');
    }

    // Update the message
    // Note: serverTimestamp() cannot be used inside an array, so we use Timestamp.now()
    // for the history entry while keeping serverTimestamp() for the top-level editedAt.
    await updateDoc(messageRef, {
      content: newContent,
      isEdited: true,
      editedAt: serverTimestamp(),
      editHistory: [
        ...(messageData.editHistory || []),
        {
          content: messageData.content,
          editedAt: Timestamp.now(),
        },
      ],
    });
  } catch (error) {
    console.error('Error editing message:', error);
    throw error;
  }
};

// Check if a message can be edited
export const canEditMessage = (message: any, userId: string): boolean => {
  // Must be sender
  if (message.senderId !== userId) return false;

  // Must be text message
  if (message.type !== 'text') return false;

  // Must not be deleted
  if (message.isDeleted) return false;

  // Must be within time limit
  const messageTime = message.timestamp?.toDate?.()?.getTime?.() || 0;
  const now = Date.now();
  if (now - messageTime > EDIT_TIME_LIMIT_MS) return false;

  return true;
};

// Pin duration options
export type PinDuration = '24h' | '1w' | '1m' | 'forever';

// Calculate pin expiry timestamp based on duration
const calculatePinExpiry = (duration: PinDuration): Date | null => {
  if (duration === 'forever') return null;

  const now = new Date();
  switch (duration) {
    case '24h':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    case '1w':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week
    case '1m':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 1 month (30 days)
    default:
      return null;
  }
};

// Pin a message (admin only)
export const pinMessage = async (
  messageId: string,
  userId: string,
  isAdmin: boolean,
  roomId?: ChatRoomId,
  duration: PinDuration = 'forever'
): Promise<void> => {
  if (!isAdmin) {
    throw new Error('Only admins can pin messages');
  }

  try {
    const collectionName = getCollectionName(roomId);
    const messageRef = doc(db, collectionName, messageId);
    const messageSnap = await getDoc(messageRef);

    if (!messageSnap.exists()) {
      throw new Error('Message not found');
    }

    const messageData = messageSnap.data();

    // Can't pin deleted messages
    if (messageData.isDeleted) {
      throw new Error('Cannot pin a deleted message');
    }

    const expiryDate = calculatePinExpiry(duration);

    await updateDoc(messageRef, {
      isPinned: true,
      pinnedAt: serverTimestamp(),
      pinnedBy: userId,
      pinDuration: duration,
      pinExpiresAt: expiryDate ? Timestamp.fromDate(expiryDate) : null,
    });
  } catch (error) {
    console.error('Error pinning message:', error);
    throw error;
  }
};

// Unpin a message (admin only)
export const unpinMessage = async (
  messageId: string,
  isAdmin: boolean,
  roomId?: ChatRoomId
): Promise<void> => {
  if (!isAdmin) {
    throw new Error('Only admins can unpin messages');
  }

  try {
    const collectionName = getCollectionName(roomId);
    const messageRef = doc(db, collectionName, messageId);
    const messageSnap = await getDoc(messageRef);

    if (!messageSnap.exists()) {
      throw new Error('Message not found');
    }

    await updateDoc(messageRef, {
      isPinned: false,
      pinnedAt: null,
      pinnedBy: null,
      pinDuration: null,
      pinExpiresAt: null,
    });
  } catch (error) {
    console.error('Error unpinning message:', error);
    throw error;
  }
};

// Subscribe to pinned messages for a room
export const subscribeToPinnedMessages = (
  callback: (messages: Message[]) => void,
  roomId?: ChatRoomId
): Unsubscribe => {
  const collectionName = getCollectionName(roomId);
  console.log('[PinnedMessages] Subscribing to pinned messages in collection:', collectionName);
  const q = query(
    collection(db, collectionName),
    where('isPinned', '==', true),
    orderBy('pinnedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      console.log('[PinnedMessages] Received snapshot with', snapshot.docs.length, 'pinned messages');
      const messages: Message[] = snapshot.docs.map((doc) => {
        console.log('[PinnedMessages] Pinned message:', doc.id, doc.data());
        return {
          id: doc.id,
          ...doc.data(),
        };
      }) as Message[];
      callback(messages);
    },
    (error) => {
      console.error('[PinnedMessages] Error subscribing to pinned messages:', error);
      console.error('[PinnedMessages] Error code:', (error as any).code);
      callback([]);
    }
  );
};

// Toggle a reaction on a message (add if not present, remove if already reacted)
export const toggleReaction = async (
  messageId: string,
  userId: string,
  emoji: string,
  roomId?: ChatRoomId
): Promise<void> => {
  try {
    const collectionName = getCollectionName(roomId);
    const messageRef = doc(db, collectionName, messageId);
    const messageSnap = await getDoc(messageRef);

    if (!messageSnap.exists()) {
      throw new Error('Message not found');
    }

    const messageData = messageSnap.data();
    const reactions: { emoji: string; userIds: string[] }[] = messageData.reactions || [];

    // Find existing reaction for this emoji
    const existingReactionIndex = reactions.findIndex((r) => r.emoji === emoji);

    if (existingReactionIndex >= 0) {
      const existingReaction = reactions[existingReactionIndex];
      const userIndex = existingReaction.userIds.indexOf(userId);

      if (userIndex >= 0) {
        // User already reacted with this emoji - remove their reaction
        existingReaction.userIds.splice(userIndex, 1);

        // If no users left for this emoji, remove the entire reaction
        if (existingReaction.userIds.length === 0) {
          reactions.splice(existingReactionIndex, 1);
        }
      } else {
        // User hasn't reacted with this emoji - add them
        existingReaction.userIds.push(userId);
      }
    } else {
      // No one has reacted with this emoji yet - create new reaction
      reactions.push({ emoji, userIds: [userId] });
    }

    await updateDoc(messageRef, { reactions });
  } catch (error) {
    console.error('Error toggling reaction:', error);
    throw error;
  }
};
