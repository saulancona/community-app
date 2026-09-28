import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { Message, ChatRoomId } from '../types';
import { useAuth } from './AuthContext';
import { useRoom } from './RoomContext';
import { getRoomConfig } from '../constants/config';
import { canAccessRoom as hasRoomTierAccess } from '../services/subscription';
import {
  useMessages,
  useSearch,
  useTyping,
  useReadReceipts,
  useUserModeration,
  useChatSettings,
} from '../hooks';

interface TypingUser {
  id: string;
  displayName: string;
}

// Failed message tracking for retry functionality
interface FailedMessage {
  id: string;
  content: string;
  timestamp: number;
  retryCount: number;
  error?: string;
}

interface ChatContextType {
  // Current room
  currentRoomId: ChatRoomId;
  // Messages
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  sendMessage: (content: string) => Promise<void>;
  sendImage: () => Promise<void>;
  sendVoiceNote: (audioData: string | Blob, duration: number) => Promise<void>;
  isUploadingImage: boolean;
  imageError: string | null;
  clearImageError: () => void;
  loadMoreMessages: () => void;
  hasMore: boolean;
  isOffline: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: Message[];
  isSearching: boolean;
  typingUsers: TypingUser[];
  onUserTyping: () => void;
  unreadCount: number;
  markAllAsRead: () => void;
  replyingTo: Message | null;
  setReplyingTo: (message: Message | null) => void;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  failedMessages: FailedMessage[];
  retryMessage: (messageId: string) => Promise<void>;
  dismissFailedMessage: (messageId: string) => void;
  // Message editing
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  checkCanEditMessage: (message: Message) => boolean;
  // Message deletion
  deleteMessage: (messageId: string) => Promise<void>;
  // User blocking/muting
  blockedUsers: string[];
  mutedUsers: string[];
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  muteUser: (userId: string) => Promise<void>;
  unmuteUser: (userId: string) => Promise<void>;
  isUserBlocked: (userId: string) => boolean;
  isUserMuted: (userId: string) => boolean;
  // Chat lock (admin control)
  chatLocked: boolean;
  canSendMessages: boolean;
  allowedSpeakers: string[];
  refreshChatSettings: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { user, isMember, isAdmin, isLoading: authLoading } = useAuth();
  const { currentRoomId } = useRoom();

  // Get room configuration for permission checks
  const roomConfig = getRoomConfig(currentRoomId);

  // Don't start any subscriptions until auth is fully loaded
  // This prevents race conditions where hooks try to access Firebase
  // before auth state is determined
  const safeUser = authLoading ? null : user;
  const safeMember = authLoading ? false : isMember;
  const safeAdmin = authLoading ? false : isAdmin;

  // Check if user has access to current room
  // Admins always have access to all rooms
  const hasRoomAccess = (() => {
    if (safeAdmin) return true;
    if (roomConfig.viewPermission === 'elite-only') {
      return hasRoomTierAccess(safeUser, 'all-access');
    }
    return safeMember;
  })();

  // Check if user can send messages in current room
  // Admins can always send in all rooms
  const canSendInRoom = (() => {
    if (safeAdmin) return true;
    if (!hasRoomAccess) return false;
    if (roomConfig.sendPermission === 'admin-only') {
      return safeAdmin;
    }
    if (roomConfig.sendPermission === 'elite-only') {
      return hasRoomTierAccess(safeUser, 'all-access');
    }
    return safeMember;
  })();

  // User moderation (blocking/muting)
  const {
    blockedUsers,
    mutedUsers,
    blockUser,
    unblockUser,
    muteUser,
    unmuteUser,
    isUserBlocked,
    isUserMuted,
  } = useUserModeration({ user: safeUser });

  // Messages - now with roomId
  const {
    messages,
    isLoading,
    isLoadingMore,
    isUploadingImage,
    imageError,
    clearImageError,
    hasMore,
    isOffline,
    replyingTo,
    setReplyingTo,
    failedMessages,
    sendMessage,
    sendImage,
    sendVoiceNote,
    loadMoreMessages,
    toggleReaction,
    deleteMessage,
    editMessage,
    checkCanEditMessage,
    retryMessage,
    dismissFailedMessage,
  } = useMessages({ user: safeUser, isMember: hasRoomAccess, blockedUsers, roomId: currentRoomId });

  // Search
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
  } = useSearch({ messages });

  // Typing indicators
  const {
    typingUsers,
    onUserTyping,
  } = useTyping({ user: safeUser, isMember: safeMember });

  // Read receipts
  const {
    unreadCount,
    markAllAsRead,
  } = useReadReceipts({ user: safeUser, messages });

  // Chat settings (lock status) - now room-specific
  const {
    chatLocked: roomChatLocked,
    canSendMessages: roomCanSend,
    allowedSpeakers,
    refreshChatSettings,
  } = useChatSettings({ user: safeUser, isMember: safeMember, isAdmin: safeAdmin, roomId: currentRoomId });

  // Combine room-specific permissions with room-specific lock
  // User must pass both room permissions AND room-specific lock
  const chatLocked = roomChatLocked;
  const canSendMessages = canSendInRoom && roomCanSend;

  // Chat is loading if either auth is loading or messages are loading
  const chatIsLoading = authLoading || isLoading;

  // Memoized so this 40+ field object keeps a stable identity when nothing
  // changed — preventing app-wide consumer re-renders (and the render-loop
  // class of bug). Every field is listed as a dependency, so the object is
  // recomputed exactly when any value actually changes (no stale closures).
  const value: ChatContextType = useMemo(
    () => ({
      currentRoomId,
      messages,
      isLoading: chatIsLoading,
      isLoadingMore,
      sendMessage,
      sendImage,
      sendVoiceNote,
      isUploadingImage,
      imageError,
      clearImageError,
      loadMoreMessages,
      hasMore,
      isOffline,
      searchQuery,
      setSearchQuery,
      searchResults,
      isSearching,
      typingUsers,
      onUserTyping,
      unreadCount,
      markAllAsRead,
      replyingTo,
      setReplyingTo,
      toggleReaction,
      failedMessages,
      retryMessage,
      dismissFailedMessage,
      editMessage,
      checkCanEditMessage,
      deleteMessage,
      blockedUsers,
      mutedUsers,
      blockUser,
      unblockUser,
      muteUser,
      unmuteUser,
      isUserBlocked,
      isUserMuted,
      chatLocked,
      canSendMessages,
      allowedSpeakers,
      refreshChatSettings,
    }),
    [
      currentRoomId, messages, chatIsLoading, isLoadingMore, sendMessage, sendImage,
      sendVoiceNote, isUploadingImage, imageError, clearImageError, loadMoreMessages,
      hasMore, isOffline, searchQuery, setSearchQuery, searchResults, isSearching,
      typingUsers, onUserTyping, unreadCount, markAllAsRead, replyingTo, setReplyingTo,
      toggleReaction, failedMessages, retryMessage, dismissFailedMessage, editMessage,
      checkCanEditMessage, deleteMessage, blockedUsers, mutedUsers, blockUser, unblockUser,
      muteUser, unmuteUser, isUserBlocked, isUserMuted, chatLocked, canSendMessages,
      allowedSpeakers, refreshChatSettings,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
