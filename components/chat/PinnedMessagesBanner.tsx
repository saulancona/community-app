import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { Message, ChatRoomId } from '../../types';
import { COLORS, SPACING } from '../../constants/config';
import { subscribeToPinnedMessages, unpinMessage } from '../../services/chat';
import { formatMessageTime, toDate } from '../../utils/formatters';

// Format time remaining for pin expiration
const formatTimeRemaining = (expiresAt: any): string => {
  if (!expiresAt) return 'Forever';

  const expiryDate = toDate(expiresAt);
  if (!expiryDate) return 'Forever';

  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();

  if (diffMs <= 0) return 'Expired';

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d left`;
  } else if (diffHours > 0) {
    return `${diffHours}h left`;
  } else {
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    return `${diffMinutes}m left`;
  }
};

// Check if a pin is expired
const isPinExpired = (message: Message): boolean => {
  if (!message.pinExpiresAt) return false;

  const expiryDate = toDate(message.pinExpiresAt);
  if (!expiryDate) return false;

  return expiryDate.getTime() <= Date.now();
};

interface PinnedMessagesBannerProps {
  roomId?: ChatRoomId;
  isAdmin?: boolean;
  userId?: string;
  onScrollToMessage?: (messageId: string) => void;
}

export const PinnedMessagesBanner: React.FC<PinnedMessagesBannerProps> = ({
  roomId,
  isAdmin = false,
  userId,
  onScrollToMessage,
}) => {
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAllPinned, setShowAllPinned] = useState(false);

  // Filter out expired pins and auto-unpin them
  const activePinnedMessages = useMemo(() => {
    return pinnedMessages.filter(msg => !isPinExpired(msg));
  }, [pinnedMessages]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    try {
      console.log('[PinnedMessagesBanner] Setting up subscription for roomId:', roomId);
      unsubscribe = subscribeToPinnedMessages((messages) => {
        console.log('[PinnedMessagesBanner] Received', messages.length, 'pinned messages');
        setPinnedMessages(messages);
        // Reset index if it's out of bounds
        const activeMessages = messages.filter(msg => !isPinExpired(msg));
        console.log('[PinnedMessagesBanner] Active (non-expired) pinned messages:', activeMessages.length);
        if (currentIndex >= activeMessages.length) {
          setCurrentIndex(Math.max(0, activeMessages.length - 1));
        }
      }, roomId);
    } catch (error) {
      console.warn('[PinnedMessagesBanner] Error setting up subscription:', error);
      // Don't crash - just don't show pinned messages
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [roomId]);

  // Auto-unpin expired messages (only admin can do this)
  useEffect(() => {
    if (!isAdmin) return;

    const expiredMessages = pinnedMessages.filter(msg => isPinExpired(msg));
    expiredMessages.forEach(async (msg) => {
      try {
        await unpinMessage(msg.id, true, roomId);
        console.log(`Auto-unpinned expired message: ${msg.id}`);
      } catch (error) {
        console.error('Error auto-unpinning message:', error);
      }
    });
  }, [pinnedMessages, isAdmin, roomId]);

  // Update timer to refresh time remaining display
  useEffect(() => {
    const timer = setInterval(() => {
      // Force re-render to update time remaining
      setPinnedMessages(prev => [...prev]);
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  const handleUnpin = async (messageId: string) => {
    try {
      await unpinMessage(messageId, isAdmin, roomId);
    } catch (error) {
      console.error('Error unpinning message:', error);
    }
  };

  const handleNextPinned = () => {
    if (activePinnedMessages.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % activePinnedMessages.length);
    }
  };

  const handlePinnedPress = () => {
    setShowAllPinned(true);
  };

  if (activePinnedMessages.length === 0) {
    return null;
  }

  const currentMessage = activePinnedMessages[currentIndex] || activePinnedMessages[0];

  // Get preview text for the message
  const getPreviewText = (message: Message) => {
    if (message.type === 'image') return '📷 Photo';
    if (message.type === 'voice') return '🎤 Voice note';
    return message.content;
  };

  return (
    <>
      {/* Pinned Message Banner */}
      <TouchableOpacity
        style={styles.banner}
        onPress={handlePinnedPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Pinned message from ${currentMessage.senderName}`}
        accessibilityHint="Tap to view pinned message"
      >
        <View style={styles.pinIcon}>
          <Text style={styles.pinEmoji}>📌</Text>
        </View>
        <View style={styles.bannerContent}>
          <View style={styles.bannerHeader}>
            <Text style={styles.senderName} numberOfLines={1}>
              {currentMessage.senderName}
            </Text>
            <View style={styles.bannerMeta}>
              {currentMessage.pinExpiresAt && (
                <Text style={styles.expiryBadge}>
                  {formatTimeRemaining(currentMessage.pinExpiresAt)}
                </Text>
              )}
              {activePinnedMessages.length > 1 && (
                <Text style={styles.pinCount}>
                  {currentIndex + 1}/{activePinnedMessages.length}
                </Text>
              )}
            </View>
          </View>
          <Text style={styles.messagePreview} numberOfLines={1}>
            {getPreviewText(currentMessage)}
          </Text>
        </View>
        {activePinnedMessages.length > 1 && (
          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleNextPinned}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.nextButtonText}>▼</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* All Pinned Messages Modal */}
      <Modal
        visible={showAllPinned}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAllPinned(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAllPinned(false)}
        >
          <Pressable
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                📌 {activePinnedMessages.length === 1 ? 'Pinned Message' : `Pinned Messages (${activePinnedMessages.length})`}
              </Text>
              <TouchableOpacity
                onPress={() => setShowAllPinned(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {activePinnedMessages.map((message, index) => (
                <View key={message.id} style={styles.pinnedItem}>
                  <View style={styles.pinnedItemContent}>
                    <View style={styles.pinnedItemHeader}>
                      <Text style={styles.pinnedItemSender}>
                        {message.senderName}
                      </Text>
                      <View style={styles.pinnedItemMeta}>
                        {message.pinExpiresAt && (
                          <Text style={styles.pinnedItemExpiry}>
                            {formatTimeRemaining(message.pinExpiresAt)}
                          </Text>
                        )}
                        <Text style={styles.pinnedItemTime}>
                          {formatMessageTime(message.timestamp)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.pinnedItemText}>
                      {getPreviewText(message)}
                    </Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity
                      style={styles.unpinButton}
                      onPress={() => handleUnpin(message.id)}
                    >
                      <Text style={styles.unpinButtonText}>Unpin</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    // Ensure banner stays above the inverted FlatList on mobile
    position: 'relative' as const,
    zIndex: 10,
  },
  pinIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(254, 42, 148, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  pinEmoji: {
    fontSize: 16,
  },
  bannerContent: {
    flex: 1,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  senderName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    flex: 1,
  },
  bannerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expiryBadge: {
    fontSize: 10,
    color: COLORS.primary,
    backgroundColor: 'rgba(254, 42, 148, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
    fontWeight: '500',
  },
  pinCount: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  messagePreview: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  nextButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  nextButtonText: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  modalScroll: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  pinnedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  pinnedItemContent: {
    flex: 1,
    padding: SPACING.md,
  },
  pinnedItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pinnedItemSender: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    flex: 1,
  },
  pinnedItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinnedItemExpiry: {
    fontSize: 10,
    color: COLORS.primary,
    backgroundColor: 'rgba(254, 42, 148, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
    fontWeight: '500',
  },
  pinnedItemTime: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  pinnedItemText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  unpinButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.border,
  },
  unpinButtonText: {
    fontSize: 12,
    color: COLORS.error,
    fontWeight: '500',
  },
});
