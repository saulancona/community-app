import { useState, useEffect, useCallback } from 'react';
import { getRoomSettings } from '../services/admin';
import { User, ChatRoomId } from '../types';

interface UseChatSettingsOptions {
  user: User | null;
  isMember: boolean;
  isAdmin: boolean;
  roomId: ChatRoomId;
}

export function useChatSettings({ user, isMember, isAdmin, roomId }: UseChatSettingsOptions) {
  const [chatLocked, setChatLocked] = useState(false);
  const [allowedSpeakers, setAllowedSpeakers] = useState<string[]>([]);

  // Load chat settings (chat lock status) for the specific room
  const refreshChatSettings = useCallback(async () => {
    try {
      const roomSettings = await getRoomSettings(roomId);
      setChatLocked(roomSettings.chatLocked ?? false);
      setAllowedSpeakers(roomSettings.allowedSpeakers ?? []);
    } catch (error) {
      console.error('Error loading room chat settings:', error);
    }
  }, [roomId]);

  // Load chat settings when room changes or membership changes
  useEffect(() => {
    if (isMember) {
      refreshChatSettings();
    }
  }, [isMember, roomId, refreshChatSettings]);

  // Determine if current user can send messages in this room
  const canSendMessages = !chatLocked || isAdmin || (user ? allowedSpeakers.includes(user.id) : false);

  return {
    chatLocked,
    canSendMessages,
    allowedSpeakers,
    refreshChatSettings,
  };
}
