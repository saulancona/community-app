import React, { useCallback, useMemo, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { FlatList, StyleSheet, View, Text, ActivityIndicator, Platform, Animated } from 'react-native';
import { Message, PinDuration, ChatRoomId, User } from '../../types';
import { MessageBubble } from './MessageBubble';
import { ChatLoadingSkeleton } from '../common/Skeleton';
import { COLORS, SPACING } from '../../constants/config';

// Virtualization settings for optimal performance
const VIRTUALIZATION_CONFIG = {
  windowSize: 10, // Number of items rendered outside visible area (each side)
  maxToRenderPerBatch: 10, // Max items to render per batch
  updateCellsBatchingPeriod: 50, // ms between batch renders
  initialNumToRender: 15, // Initial items to render
  // Only use removeClippedSubviews on native Android - causes issues on web/iOS
  removeClippedSubviews: Platform.OS === 'android',
};

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  totalMembers?: number;
  onReply?: (message: Message) => void;
  onReaction?: (message: Message) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, newContent: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  checkCanEdit?: (message: Message) => boolean;
  isAdmin?: boolean;
  onPin?: (messageId: string, duration: PinDuration) => Promise<void>;
  onUnpin?: (messageId: string) => Promise<void>;
  // Poll props
  roomId?: ChatRoomId;
  onClosePoll?: (messageId: string) => Promise<void>;
  onReopenPoll?: (messageId: string) => Promise<void>;
  members?: User[];
}

export interface MessageListRef {
  scrollToMessage: (messageId: string) => void;
}

export const MessageList = forwardRef<MessageListRef, MessageListProps>(({
  messages,
  currentUserId,
  isLoading = false,
  isLoadingMore = false,
  hasMore = false,
  onLoadMore,
  totalMembers = 1,
  onReply,
  onReaction,
  onToggleReaction,
  onEdit,
  onDelete,
  checkCanEdit,
  isAdmin = false,
  onPin,
  onUnpin,
  roomId,
  onClosePoll,
  onReopenPoll,
  members,
}, ref) => {
  const flatListRef = useRef<FlatList>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flash highlight on a message after scrolling to it
  const highlightMessage = useCallback((messageId: string) => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    setHighlightedMessageId(messageId);
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
    }, 2000);
  }, []);

  // Expose scrollToMessage method to parent
  useImperativeHandle(ref, () => ({
    scrollToMessage: (messageId: string) => {
      const index = messages.findIndex(m => m.id === messageId);
      if (index !== -1 && flatListRef.current) {
        try {
          flatListRef.current.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.5,
          });
        } catch {
          flatListRef.current.scrollToOffset({
            offset: index * 80,
            animated: true,
          });
        }
        // Highlight the message after scroll completes
        setTimeout(() => highlightMessage(messageId), 400);
      }
    },
  }), [messages, highlightMessage]);

  // Handle scrollToIndex failures (item outside virtualization window on mobile)
  const handleScrollToIndexFailed = useCallback((info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => {
    flatListRef.current?.scrollToOffset({
      offset: info.averageItemLength * info.index,
      animated: true,
    });
    setTimeout(() => {
      if (flatListRef.current) {
        try {
          flatListRef.current.scrollToIndex({
            index: info.index,
            animated: true,
            viewPosition: 0.5,
          });
        } catch {
          // ignore — already at best-effort position
        }
      }
    }, 300);
  }, []);
  // Memoize message grouping info to avoid recalculation on every render
  const messageGroupingInfo = useMemo(() => {
    const info: Record<string, { isFirstInGroup: boolean; isLastInGroup: boolean }> = {};

    messages.forEach((item, index) => {
      const olderMessage = messages[index + 1];
      const newerMessage = messages[index - 1];

      const isFirstInGroup = !!(!olderMessage ||
        olderMessage.senderId !== item.senderId ||
        olderMessage.type === 'system' ||
        item.type === 'system' ||
        olderMessage.isDeleted ||
        item.isDeleted);

      const isLastInGroup = !!(!newerMessage ||
        newerMessage.senderId !== item.senderId ||
        newerMessage.type === 'system' ||
        item.type === 'system' ||
        newerMessage.isDeleted ||
        item.isDeleted);

      info[item.id] = { isFirstInGroup, isLastInGroup };
    });

    return info;
  }, [messages]);

  // Memoized render function for better performance
  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isOwnMessage = item.senderId === currentUserId;
    const groupInfo = messageGroupingInfo[item.id] || { isFirstInGroup: true, isLastInGroup: true };
    const canEdit = checkCanEdit ? checkCanEdit(item) : false;
    const isHighlighted = highlightedMessageId === item.id;

    return (
      <View style={isHighlighted ? styles.highlightedMessage : undefined}>
        <MessageBubble
          message={item}
          isOwnMessage={isOwnMessage}
          showSenderName={!isOwnMessage}
          isFirstInGroup={groupInfo.isFirstInGroup}
          isLastInGroup={groupInfo.isLastInGroup}
          totalMembers={totalMembers}
          onReply={onReply}
          onReaction={onReaction}
          onToggleReaction={onToggleReaction}
          onEdit={onEdit}
          onDelete={onDelete}
          canEdit={canEdit}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onPin={onPin}
          onUnpin={onUnpin}
          roomId={roomId}
          onClosePoll={onClosePoll}
          onReopenPoll={onReopenPoll}
          members={members}
        />
      </View>
    );
  }, [currentUserId, messageGroupingInfo, totalMembers, onReply, onReaction, onToggleReaction, onEdit, onDelete, checkCanEdit, isAdmin, onPin, onUnpin, roomId, onClosePoll, onReopenPoll, members, highlightedMessageId]);

  // Stable key extractor
  const keyExtractor = useCallback((item: Message) => item.id, []);

  // Memoized footer component
  const ListFooterComponent = useMemo(() => {
    if (!isLoadingMore) return null;

    return (
      <View style={styles.loadingMoreContainer}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.loadingMoreText}>Loading older messages...</Text>
      </View>
    );
  }, [isLoadingMore]);

  // Memoized end reached handler
  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  if (isLoading && messages.length === 0) {
    return (
      <View style={styles.container}>
        <ChatLoadingSkeleton />
      </View>
    );
  }

  if (messages.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyBubble}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptySubtitle}>
              Send a message to start the conversation!
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        inverted
        contentContainerStyle={styles.listContent}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={ListFooterComponent}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
        // Virtualization optimizations
        windowSize={VIRTUALIZATION_CONFIG.windowSize}
        maxToRenderPerBatch={VIRTUALIZATION_CONFIG.maxToRenderPerBatch}
        updateCellsBatchingPeriod={VIRTUALIZATION_CONFIG.updateCellsBatchingPeriod}
        initialNumToRender={VIRTUALIZATION_CONFIG.initialNumToRender}
        removeClippedSubviews={VIRTUALIZATION_CONFIG.removeClippedSubviews}
        // Prevent unnecessary re-renders — include highlightedMessageId so the
        // list re-renders the target cell with/without the highlight style.
        extraData={`${currentUserId}_${highlightedMessageId}`}
        // Mobile scroll improvements
        scrollEventThrottle={16}
        bounces={true}
        overScrollMode="always"
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollToIndexFailed={handleScrollToIndexFailed}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.chatBackground,
  },
  highlightedMessage: {
    backgroundColor: 'rgba(254, 42, 148, 0.12)',
    borderRadius: 12,
  },
  listContent: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: SPACING.sm,
  },
  dateBubble: {
    backgroundColor: 'rgba(255, 255, 220, 0.9)',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyBubble: {
    backgroundColor: 'rgba(255, 255, 220, 0.9)',
    padding: SPACING.lg,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  loadingMoreText: {
    marginLeft: SPACING.sm,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});
