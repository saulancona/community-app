import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToTypingUsers,
  handleTyping,
  cleanupTyping,
} from '../services/typing';
import { User } from '../types';

interface TypingUser {
  id: string;
  displayName: string;
}

interface UseTypingOptions {
  user: User | null;
  isMember: boolean;
}

export function useTyping({ user, isMember }: UseTypingOptions) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  // Subscribe to typing indicators
  useEffect(() => {
    if (!user || !isMember) {
      setTypingUsers([]);
      return;
    }

    const unsubscribe = subscribeToTypingUsers(user.id, (users) => {
      setTypingUsers(users);
    });

    // Cleanup typing status on unmount
    return () => {
      unsubscribe();
      cleanupTyping(user.id);
    };
  }, [user, isMember]);

  // Callback for when user is typing
  const onUserTyping = useCallback(() => {
    if (user) {
      handleTyping(user.id, user.displayName);
    }
  }, [user]);

  return {
    typingUsers,
    onUserTyping,
  };
}
