import { useState, useEffect, useCallback } from 'react';
import { Message } from '../types';
import { markMessagesAsRead } from '../services/chat';
import { User } from '../types';

interface UseReadReceiptsOptions {
  user: User | null;
  messages: Message[];
}

export function useReadReceipts({ user, messages }: UseReadReceiptsOptions) {
  const [isChatActive, setIsChatActive] = useState(true);

  // Track page visibility to pause marking messages as read when tab is not active
  useEffect(() => {
    // Web only — native has no DOM document.addEventListener (see the
    // addNetworkListener crash). Verify the method exists before using it.
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;

    const handleVisibilityChange = () => {
      const isActive = !document.hidden;
      setIsChatActive(isActive);

      // When becoming active again, mark unread messages as read
      if (isActive && user && messages.length > 0) {
        const unreadIds = messages
          .filter(msg => msg.senderId !== user.id && (!msg.readBy || !msg.readBy.includes(user.id)))
          .map(msg => msg.id);

        if (unreadIds.length > 0) {
          markMessagesAsRead(unreadIds, user.id);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, messages]);

  // Calculate unread count
  const unreadCount = user
    ? messages.filter(
        msg => msg.senderId !== user.id &&
               msg.senderId !== 'system' &&
               (!msg.readBy || !msg.readBy.includes(user.id))
      ).length
    : 0;

  // Update browser title with unread count
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const baseTitle = 'Northstar Coaching';
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }, [unreadCount]);

  // Mark all messages as read
  const markAllAsRead = useCallback(() => {
    if (!user) return;

    const unreadIds = messages
      .filter(msg => msg.senderId !== user.id && (!msg.readBy || !msg.readBy.includes(user.id)))
      .map(msg => msg.id);

    if (unreadIds.length > 0) {
      markMessagesAsRead(unreadIds, user.id);
    }
  }, [user, messages]);

  return {
    isChatActive,
    unreadCount,
    markAllAsRead,
  };
}
