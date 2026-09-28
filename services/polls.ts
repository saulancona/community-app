import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';
import { Poll, PollOption, PollType, ChatRoomId } from '../types';
import { getRoomConfig } from '../constants/config';
import { toDate } from '../utils/formatters';

// Default collection for backwards compatibility
const DEFAULT_COLLECTION = 'messages';

// Get the collection name for a room
const getCollectionName = (roomId?: ChatRoomId): string => {
  if (!roomId) return DEFAULT_COLLECTION;
  return getRoomConfig(roomId).messagesCollection;
};

// Generate a unique ID for poll options
const generateOptionId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

// Generate a unique poll ID
const generatePollId = (): string => {
  return `poll_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Create a new poll (admin only - enforce in UI)
 */
export const createPoll = async (
  senderId: string,
  senderName: string,
  question: string,
  optionTexts: string[],
  pollType: PollType,
  isAnonymous: boolean,
  expiresAt: Date | null,
  senderAvatar?: string,
  roomId?: ChatRoomId
): Promise<string> => {
  try {
    const collectionName = getCollectionName(roomId);

    // Create poll options
    const options: PollOption[] = optionTexts.map((text) => ({
      id: generateOptionId(),
      text: text.trim(),
      voteCount: 0,
      voterIds: [],
    }));

    // Create the poll object
    const poll: Omit<Poll, 'id'> & { id: string } = {
      id: generatePollId(),
      question: question.trim(),
      options,
      pollType,
      isAnonymous,
      expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
      isClosed: false,
      totalVotes: 0,
    };

    // Build message data
    const messageData: Record<string, any> = {
      senderId,
      senderName,
      content: question.trim(), // Store question in content for search
      type: 'poll',
      timestamp: serverTimestamp(),
      readBy: [senderId],
      poll,
    };

    if (senderAvatar) {
      messageData.senderAvatar = senderAvatar;
    }

    const docRef = await addDoc(collection(db, collectionName), messageData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating poll:', error);
    throw error;
  }
};

/**
 * Vote on a poll
 */
export const votePoll = async (
  messageId: string,
  userId: string,
  selectedOptionIds: string[],
  roomId?: ChatRoomId
): Promise<void> => {
  try {
    const collectionName = getCollectionName(roomId);
    const messageRef = doc(db, collectionName, messageId);

    await runTransaction(db, async (transaction) => {
      const messageDoc = await transaction.get(messageRef);

      if (!messageDoc.exists()) {
        throw new Error('Poll not found');
      }

      const data = messageDoc.data();
      const poll = data.poll as Poll;

      if (!poll) {
        throw new Error('This message is not a poll');
      }

      // Check if poll is closed
      if (poll.isClosed) {
        throw new Error('This poll is closed');
      }

      // Check if poll has expired
      if (poll.expiresAt) {
        const expiresAt = toDate(poll.expiresAt);
        if (expiresAt && expiresAt < new Date()) {
          throw new Error('This poll has expired');
        }
      }

      // Check if user has already voted
      const hasVoted = poll.options.some((opt) => opt.voterIds.includes(userId));
      if (hasVoted) {
        throw new Error('You have already voted on this poll');
      }

      // Validate selection based on poll type
      if (poll.pollType === 'single' && selectedOptionIds.length !== 1) {
        throw new Error('Please select exactly one option');
      }

      if (poll.pollType === 'multiple' && selectedOptionIds.length === 0) {
        throw new Error('Please select at least one option');
      }

      // Update the poll options with the vote
      // Always track voter IDs for duplicate vote prevention
      // For anonymous polls, voterIds are stored but not displayed in UI
      const updatedOptions = poll.options.map((option) => {
        if (selectedOptionIds.includes(option.id)) {
          return {
            ...option,
            voteCount: option.voteCount + 1,
            voterIds: [...option.voterIds, userId],
          };
        }
        return option;
      });

      // Update the poll
      const updatedPoll: Poll = {
        ...poll,
        options: updatedOptions,
        totalVotes: poll.totalVotes + 1,
      };

      transaction.update(messageRef, { poll: updatedPoll });
    });
  } catch (error) {
    console.error('Error voting on poll:', error);
    throw error;
  }
};

/**
 * Close a poll (admin only - enforce in UI)
 */
export const closePoll = async (
  messageId: string,
  roomId?: ChatRoomId
): Promise<void> => {
  try {
    const collectionName = getCollectionName(roomId);
    const messageRef = doc(db, collectionName, messageId);

    const messageDoc = await getDoc(messageRef);
    if (!messageDoc.exists()) {
      throw new Error('Poll not found');
    }

    const data = messageDoc.data();
    const poll = data.poll as Poll;

    if (!poll) {
      throw new Error('This message is not a poll');
    }

    await updateDoc(messageRef, {
      'poll.isClosed': true,
    });
  } catch (error) {
    console.error('Error closing poll:', error);
    throw error;
  }
};

/**
 * Reopen a closed poll (admin only - enforce in UI)
 */
export const reopenPoll = async (
  messageId: string,
  roomId?: ChatRoomId
): Promise<void> => {
  try {
    const collectionName = getCollectionName(roomId);
    const messageRef = doc(db, collectionName, messageId);

    await updateDoc(messageRef, {
      'poll.isClosed': false,
    });
  } catch (error) {
    console.error('Error reopening poll:', error);
    throw error;
  }
};

/**
 * Check if a user has already voted on a poll
 */
export const hasUserVoted = (poll: Poll, userId: string): boolean => {
  return poll.options.some((option) => option.voterIds.includes(userId));
};

/**
 * Check if a poll has expired
 */
export const isPollExpired = (poll: Poll): boolean => {
  if (!poll.expiresAt) return false;

  const expiresAt = toDate(poll.expiresAt);
  if (!expiresAt) return false;

  return expiresAt < new Date();
};

/**
 * Check if a poll is active (not closed and not expired)
 */
export const isPollActive = (poll: Poll): boolean => {
  return !poll.isClosed && !isPollExpired(poll);
};

/**
 * Get the time remaining until poll expires
 */
export const getPollTimeRemaining = (poll: Poll): string | null => {
  if (!poll.expiresAt) return null;

  const expiresAt = toDate(poll.expiresAt);
  if (!expiresAt) return null;

  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
};

/**
 * Calculate percentage for a poll option
 */
export const getOptionPercentage = (option: PollOption, totalVotes: number): number => {
  if (totalVotes === 0) return 0;
  return Math.round((option.voteCount / totalVotes) * 100);
};

/**
 * Get which options a user voted for (for non-anonymous polls)
 */
export const getUserVotedOptions = (poll: Poll, userId: string): string[] => {
  return poll.options
    .filter((option) => option.voterIds.includes(userId))
    .map((option) => option.id);
};
