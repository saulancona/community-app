import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { Message, ChatRoomId } from '../types';
import {
  subscribeToMessages,
  fetchMoreMessages,
  sendMessage as sendChatMessage,
  sendImageMessage as sendChatImageMessage,
  sendVideoMessage as sendChatVideoMessage,
  sendVoiceMessage as sendChatVoiceMessage,
  markMessagesAsRead,
  toggleReaction as toggleMessageReaction,
  deleteMessage as deleteMessageService,
  editMessage as editMessageService,
  canEditMessage,
} from '../services/chat';
import { showMessageNotification, isNotificationSupported, getNotificationPermission } from '../services/notifications';
import { compressImage, validateImageFile, validateVideoFile, isVideoFile, pickMedia, uploadVideo, uploadAudio, uploadAudioBlob } from '../services/images';
import { cacheMessages, getCachedMessages, isOnline, addNetworkListener, clearPendingMessages } from '../services/offline';
import { sanitizeMessage, validateMessage, containsSpamPatterns } from '../utils/validators';
import { User } from '../types';

interface ReplyTo {
  id: string;
  content: string;
  senderName: string;
  type: 'text' | 'image' | 'video' | 'voice';
}

// Failed message tracking for retry functionality
interface FailedMessage {
  id: string;
  content: string;
  timestamp: number;
  retryCount: number;
  error?: string;
}

// Rate limiting configuration
const RATE_LIMIT = {
  maxMessages: 10,
  windowMs: 10000, // 10 second window
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second base delay
  maxDelay: 10000, // 10 seconds max delay
};

interface UseMessagesOptions {
  user: User | null;
  isMember: boolean;
  blockedUsers: string[];
  roomId?: ChatRoomId;
}

export function useMessages({ user, isMember, blockedUsers, roomId }: UseMessagesOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [failedMessages, setFailedMessages] = useState<FailedMessage[]>([]);

  const previousMessagesRef = useRef<Message[]>([]);
  const isInitialLoadRef = useRef(true);
  const messageTimes = useRef<number[]>([]);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Check if user is rate limited
  const isRateLimited = useCallback((): boolean => {
    const now = Date.now();
    messageTimes.current = messageTimes.current.filter(
      (time) => now - time < RATE_LIMIT.windowMs
    );
    return messageTimes.current.length >= RATE_LIMIT.maxMessages;
  }, []);

  // Record a message send for rate limiting
  const recordMessageSend = useCallback(() => {
    messageTimes.current.push(Date.now());
  }, []);

  // Monitor online/offline status (for the offline indicator only).
  useEffect(() => {
    // Purge any stale offline send-queue left by older app versions, so it can
    // never replay old messages into the current room on reconnect. Sends that
    // fail now surface via the failedMessages retry UI instead of being queued.
    clearPendingMessages();

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    const cleanup = addNetworkListener(handleOnline, handleOffline);
    return cleanup;
  }, [user]);

  // Load cached messages when offline or on initial load
  useEffect(() => {
    const loadCachedData = async () => {
      if (!isMember) return;
      const cached = await getCachedMessages();
      if (cached.length > 0 && messages.length === 0) {
        setMessages(cached);
      }
    };
    loadCachedData();
  }, [isMember, messages.length]);

  // Subscribe to messages
  useEffect(() => {
    if (!isMember) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    isInitialLoadRef.current = true;

    // Add a small delay to ensure Firebase is fully initialized
    // This helps prevent race conditions on initial load
    const subscriptionTimeout = setTimeout(() => {
      try {
        const unsubscribe = subscribeToMessages(
        (result) => {
          const { messages: newMessages, lastDoc, hasMore: moreAvailable } = result;

          // Check for new messages to notify (only after initial load)
          if (!isInitialLoadRef.current && user && isNotificationSupported() && getNotificationPermission() === 'granted') {
            const previousIds = new Set(previousMessagesRef.current.map(m => m.id));
            const newIncomingMessages = newMessages.filter(
              msg => !previousIds.has(msg.id) && msg.senderId !== user.id && msg.senderId !== 'system'
            );

            newIncomingMessages.forEach(msg => {
              const notificationContent = msg.type === 'image' ? 'Sent an image' : msg.type === 'video' ? 'Sent a video' : msg.content;
              showMessageNotification(msg.senderName, notificationContent, msg.id);
            });
          }

          previousMessagesRef.current = newMessages;
          isInitialLoadRef.current = false;
          setMessages(newMessages);
          setLastVisible(lastDoc);
          setHasMore(moreAvailable);
          setIsLoading(false);

          // Cache messages for offline use
          cacheMessages(newMessages);

          // Mark unread messages as read only if chat is active
          if (user && (typeof document === 'undefined' || !document.hidden)) {
            const unreadMessageIds = newMessages
              .filter(
                (msg) =>
                  msg.senderId !== user.id &&
                  (!msg.readBy || !msg.readBy.includes(user.id))
              )
              .map((msg) => msg.id);

            if (unreadMessageIds.length > 0) {
              markMessagesAsRead(unreadMessageIds, user.id, roomId);
            }
          }
        },
        (error) => {
          // Handle subscription errors gracefully - don't crash
          console.warn('Messages subscription error:', error);
          setIsLoading(false);
          // Messages will remain as cached or empty - user can retry
        },
        roomId
      );

        // Store unsubscribe for cleanup
        unsubscribeRef.current = unsubscribe;
      } catch (error) {
        // If subscription setup fails, log and set loading to false
        console.error('Error setting up messages subscription:', error);
        setIsLoading(false);
      }
    }, 100); // Small delay to let Firebase stabilize

    return () => {
      clearTimeout(subscriptionTimeout);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [isMember, user, roomId]);

  // Helper function for exponential backoff retry
  const sendWithRetry = useCallback(
    async (
      content: string,
      replyData?: ReplyTo,
      retryCount = 0,
      messageId?: string
    ): Promise<void> => {
      if (!user) return;

      try {
        await sendChatMessage(
          user.id,
          user.displayName,
          content,
          user.avatarUrl,
          replyData,
          roomId
        );

        if (messageId) {
          setFailedMessages((prev) => prev.filter((m) => m.id !== messageId));
        }

        recordMessageSend();
      } catch (error) {
        console.error('Error sending message:', error);

        const delay = Math.min(
          RETRY_CONFIG.baseDelay * Math.pow(2, retryCount),
          RETRY_CONFIG.maxDelay
        );

        if (retryCount < RETRY_CONFIG.maxRetries) {
          setTimeout(() => {
            sendWithRetry(content, replyData, retryCount + 1, messageId);
          }, delay);
        } else {
          const failedId = messageId || `failed-${Date.now()}`;
          setFailedMessages((prev) => [
            ...prev.filter((m) => m.id !== failedId),
            {
              id: failedId,
              content,
              timestamp: Date.now(),
              retryCount,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          ]);
        }
      }
    },
    [user, recordMessageSend, roomId]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user) return;

      // Sanitize the message content
      const sanitizedContent = sanitizeMessage(content);

      // Validate the message
      const validation = validateMessage(sanitizedContent);
      if (!validation.valid) {
        if (typeof window !== 'undefined' && validation.error) {
          window.alert(validation.error);
        }
        return;
      }

      // Check for spam patterns
      if (containsSpamPatterns(sanitizedContent)) {
        if (typeof window !== 'undefined') {
          window.alert('Your message was flagged as potential spam. Please revise and try again.');
        }
        return;
      }

      if (isRateLimited()) {
        if (typeof window !== 'undefined') {
          window.alert('You\'re sending messages too fast. Please wait a moment.');
        }
        return;
      }

      // NOTE: we intentionally do NOT silently queue when offline. Doing so
      // stranded messages in a local outbox that later auto-replayed in a burst
      // into whatever room the user was in (the "old messages randomly resent"
      // bug). Instead the send proceeds through sendWithRetry; if it can't be
      // delivered it surfaces in `failedMessages` for the user to retry.
      const replyData = replyingTo ? {
        id: replyingTo.id,
        content: replyingTo.type === 'image' ? 'Photo' : replyingTo.type === 'video' ? 'Video' : replyingTo.content,
        senderName: replyingTo.senderName,
        type: replyingTo.type as 'text' | 'image',
      } : undefined;

      setReplyingTo(null);
      await sendWithRetry(sanitizedContent, replyData);
    },
    [user, replyingTo, isRateLimited, sendWithRetry]
  );

  const retryMessage = useCallback(
    async (messageId: string) => {
      const failedMessage = failedMessages.find((m) => m.id === messageId);
      if (!failedMessage || !user) return;
      await sendWithRetry(failedMessage.content, undefined, 0, messageId);
    },
    [failedMessages, user, sendWithRetry]
  );

  const dismissFailedMessage = useCallback((messageId: string) => {
    setFailedMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const sendImage = useCallback(async () => {
    if (!user) {
      console.error('[Media] No user found');
      return;
    }

    try {
      console.log('[Media] Opening file picker...');
      const file = await pickMedia();
      if (!file) {
        console.log('[Media] No file selected');
        return;
      }
      console.log('[Media] File selected:', file.name, file.type, file.size, 'bytes');

      // Check if it's a video
      if (isVideoFile(file)) {
        const validation = validateVideoFile(file);
        if (!validation.valid) {
          console.error('[Video] Validation failed:', validation.error);
          setImageError(validation.error || 'Invalid video file');
          return;
        }

        // Get video duration BEFORE uploading (fail fast on mobile)
        console.log('[Video] Checking duration...');
        const duration = await new Promise<number>((resolve) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          // Timeout after 10 seconds — on mobile, metadata may never load for large files
          const timeout = setTimeout(() => {
            URL.revokeObjectURL(video.src);
            console.warn('[Video] Metadata timeout — proceeding without duration');
            resolve(0);
          }, 10000);
          video.onloadedmetadata = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(video.src);
            resolve(Math.round(video.duration));
          };
          video.onerror = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(video.src);
            resolve(0);
          };
          video.src = URL.createObjectURL(file);
        });
        console.log('[Video] Duration:', duration, 'seconds');

        setIsUploadingImage(true);
        setImageError(null);

        console.log('[Video] Uploading to storage...', (file.size / (1024 * 1024)).toFixed(1) + 'MB');
        const videoUrl = await uploadVideo(file, user.id);
        console.log('[Video] Upload complete, URL:', videoUrl);

        await sendChatVideoMessage(
          user.id,
          user.displayName,
          videoUrl,
          duration,
          user.avatarUrl,
          roomId
        );
        console.log('[Video] Message sent successfully!');
        return;
      }

      // Handle image upload (existing flow)
      const validation = validateImageFile(file);
      if (!validation.valid) {
        console.error('[Image] Validation failed:', validation.error);
        setImageError(validation.error || 'Invalid image file');
        return;
      }

      setIsUploadingImage(true);
      setImageError(null);

      console.log('[Image] Compressing...');
      const compressedBlob = await compressImage(file);
      console.log('[Image] Compressed to', compressedBlob.size, 'bytes');

      // Get dimensions from compressed image
      const img = new Image();
      const dimensionsPromise = new Promise<{ width: number; height: number }>((resolve) => {
        img.onload = () => {
          resolve({ width: img.width, height: img.height });
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(compressedBlob);
      });
      const { width, height } = await dimensionsPromise;
      console.log('[Image] Dimensions:', width, 'x', height);

      // Convert to base64 for server-side upload (bypasses CORS/iframe issues)
      console.log('[Image] Converting to base64...');
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // Strip data:image/...;base64, prefix
        };
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(compressedBlob);
      });
      console.log('[Image] Base64 ready, length:', base64.length);

      // Send through cloud function (server handles Storage upload)
      console.log('[Image] Sending to server...');
      await sendChatImageMessage(
        user.id,
        user.displayName,
        '',
        width,
        height,
        user.avatarUrl,
        roomId,
        base64,
        compressedBlob.type || 'image/jpeg'
      );
      console.log('[Image] Message sent successfully!');
    } catch (error: any) {
      console.error('[Media] Error sending media:', error);
      console.error('[Media] Error code:', error?.code);
      console.error('[Media] Error message:', error?.message);
      setImageError(error?.message || 'Failed to send media. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  }, [user, roomId]);

  const sendVoiceNote = useCallback(async (audioData: string | Blob, duration: number) => {
    console.log('[VoiceNote] sendVoiceNote start', {
      hasUser: !!user,
      userId: user?.id,
      isAdmin: user?.role === 'admin',
      roomId,
      duration,
      isBlob: audioData instanceof Blob,
    });
    if (!user) {
      window.alert('You must be signed in to send voice notes.');
      return;
    }

    try {
      let audioUrl: string;
      if (audioData instanceof Blob) {
        console.log('[VoiceNote] uploading blob to storage...');
        audioUrl = await uploadAudioBlob(audioData, user.id);
      } else {
        console.log('[VoiceNote] uploading uri to storage...');
        audioUrl = await uploadAudio(audioData, user.id);
      }
      console.log('[VoiceNote] storage upload complete', { audioUrl });

      console.log('[VoiceNote] writing message doc to firestore...');
      await sendChatVoiceMessage(
        user.id,
        user.displayName,
        audioUrl,
        duration,
        user.avatarUrl,
        roomId
      );
      console.log('[VoiceNote] firestore write complete — message sent');
    } catch (error: any) {
      console.error('[VoiceNote] FAILED', error);
      if (typeof window !== 'undefined') {
        const code = error?.code ? ` [${error.code}]` : '';
        const detail = error?.message ? `: ${error.message}` : '';
        window.alert(`Failed to send voice note${code}${detail}`);
      }
      throw error;
    }
  }, [user, roomId]);

  const loadMoreMessages = useCallback(async () => {
    if (!lastVisible || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);

    try {
      const result = await fetchMoreMessages(lastVisible, roomId);

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages = result.messages.filter((m) => !existingIds.has(m.id));
        return [...prev, ...newMessages];
      });

      setLastVisible(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [lastVisible, isLoadingMore, hasMore, roomId]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    try {
      await toggleMessageReaction(messageId, user.id, emoji, roomId);
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  }, [user, roomId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return;
    try {
      const isAdmin = user.role === 'admin';
      await deleteMessageService(messageId, user.id, isAdmin, roomId);
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }, [user, roomId]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!user) return;

    // Sanitize the new content
    const sanitizedContent = sanitizeMessage(newContent);

    // Validate the message
    const validation = validateMessage(sanitizedContent);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid message');
    }

    // Check for spam patterns
    if (containsSpamPatterns(sanitizedContent)) {
      throw new Error('Your message was flagged as potential spam. Please revise and try again.');
    }

    try {
      await editMessageService(messageId, user.id, sanitizedContent, roomId);
    } catch (error) {
      console.error('Error editing message:', error);
      throw error;
    }
  }, [user, roomId]);

  const checkCanEditMessage = useCallback((message: Message) => {
    if (!user) return false;
    return canEditMessage(message, user.id);
  }, [user]);

  // Filter messages from blocked users.
  // MUST be memoized: this array is exposed as `messages` and used as a
  // dependency by consumer effects (useSearch, useReadReceipts). A bare
  // .filter() returns a NEW array reference every render, which made those
  // effects re-run every render and call setState — an infinite render loop
  // (React #185 "Maximum update depth exceeded") that crashed every screen.
  const filteredMessages = useMemo(
    () => messages.filter(
      (msg) => !blockedUsers.includes(msg.senderId) || msg.senderId === 'system'
    ),
    [messages, blockedUsers]
  );

  return {
    messages: filteredMessages,
    isLoading,
    isLoadingMore,
    isUploadingImage,
    imageError,
    clearImageError: () => setImageError(null),
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
  };
}
