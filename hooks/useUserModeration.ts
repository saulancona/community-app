import { useState, useEffect, useCallback } from 'react';
import {
  blockUser as blockUserService,
  unblockUser as unblockUserService,
  muteUser as muteUserService,
  unmuteUser as unmuteUserService,
  getBlockedUsers,
  getMutedUsers,
} from '../services/users';
import { User } from '../types';

interface UseUserModerationOptions {
  user: User | null;
}

export function useUserModeration({ user }: UseUserModerationOptions) {
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [mutedUsers, setMutedUsers] = useState<string[]>([]);

  // Load blocked and muted users on mount
  useEffect(() => {
    if (!user) {
      setBlockedUsers([]);
      setMutedUsers([]);
      return;
    }

    const loadUserPreferences = async () => {
      try {
        const [blocked, muted] = await Promise.all([
          getBlockedUsers(user.id),
          getMutedUsers(user.id),
        ]);
        setBlockedUsers(blocked);
        setMutedUsers(muted);
      } catch (error) {
        console.error('Error loading user preferences:', error);
      }
    };

    loadUserPreferences();
  }, [user]);

  // Block a user
  const blockUser = useCallback(async (userId: string) => {
    if (!user) return;

    try {
      await blockUserService(user.id, userId);
      setBlockedUsers((prev) => [...prev, userId]);
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }, [user]);

  // Unblock a user
  const unblockUser = useCallback(async (userId: string) => {
    if (!user) return;

    try {
      await unblockUserService(user.id, userId);
      setBlockedUsers((prev) => prev.filter((id) => id !== userId));
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  }, [user]);

  // Mute a user
  const muteUser = useCallback(async (userId: string) => {
    if (!user) return;

    try {
      await muteUserService(user.id, userId);
      setMutedUsers((prev) => [...prev, userId]);
    } catch (error) {
      console.error('Error muting user:', error);
      throw error;
    }
  }, [user]);

  // Unmute a user
  const unmuteUser = useCallback(async (userId: string) => {
    if (!user) return;

    try {
      await unmuteUserService(user.id, userId);
      setMutedUsers((prev) => prev.filter((id) => id !== userId));
    } catch (error) {
      console.error('Error unmuting user:', error);
      throw error;
    }
  }, [user]);

  // Check if a user is blocked
  const isUserBlocked = useCallback((userId: string): boolean => {
    return blockedUsers.includes(userId);
  }, [blockedUsers]);

  // Check if a user is muted
  const isUserMuted = useCallback((userId: string): boolean => {
    return mutedUsers.includes(userId);
  }, [mutedUsers]);

  return {
    blockedUsers,
    mutedUsers,
    blockUser,
    unblockUser,
    muteUser,
    unmuteUser,
    isUserBlocked,
    isUserMuted,
  };
}
