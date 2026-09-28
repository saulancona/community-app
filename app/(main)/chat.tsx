import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ImageBackground, Image } from 'react-native';
import { useRouter, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { canAccessRoom as hasRoomTierAccess } from '../../services/subscription';
import { MessageList } from '../../components/chat/MessageList';
import { MessageInput } from '../../components/chat/MessageInput';
import { MenuDropdown } from '../../components/chat/MenuDropdown';
import { SearchBar } from '../../components/chat/SearchBar';
import { TypingIndicator } from '../../components/chat/TypingIndicator';
import { ReactionPicker } from '../../components/chat/ReactionPicker';
import { FailedMessageBanner } from '../../components/chat/FailedMessageBanner';
import { PinnedMessagesBanner } from '../../components/chat/PinnedMessagesBanner';
import { CreatePollModal } from '../../components/chat/CreatePollModal';
import { ScreenErrorBoundary } from '../../components/common/ScreenErrorBoundary';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useRoom } from '../../context/RoomContext';
import { getCommunity, getMembers } from '../../services/admin';
import { pinMessage, unpinMessage, PinDuration } from '../../services/chat';
import { createPoll, closePoll, reopenPoll } from '../../services/polls';
import { COLORS, SPACING } from '../../constants/config';
import { Message, ChatRoomId, PollType, User } from '../../types';

const ROOM_CONFIG: Record<ChatRoomId, { name: string; logo: any; emojiLogo?: string }> = {
  'inner-circle': {
    name: 'Inner Circle',
    logo: require('../../assets/logo-gold.jpeg'),
  },
  'growth-lab': {
    name: 'Growth Lab',
    logo: null,
    emojiLogo: '👑',
  },
};

// Error boundary wrapper for components that might fail without crashing the whole chat
class ComponentErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.warn('[ComponentErrorBoundary] Error caught:', error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

// Header components that don't depend on state
const HeaderLeft: React.FC<{ onBack: () => void; onMenu: () => void }> = ({ onBack, onMenu }) => (
  <View style={styles.headerLeftButtons}>
    <TouchableOpacity onPress={onBack} style={styles.headerButton}>
      <BackIcon color={COLORS.surface} />
    </TouchableOpacity>
    <TouchableOpacity onPress={onMenu} style={styles.headerButton}>
      <MenuIcon color={COLORS.surface} />
    </TouchableOpacity>
  </View>
);

// Custom header title with logo
const HeaderTitle: React.FC<{ name: string; logo: any; emojiLogo?: string }> = ({ name, logo, emojiLogo }) => (
  <View style={styles.headerTitleContainer}>
    {logo ? (
      <Image source={logo} style={styles.headerLogo} resizeMode="contain" />
    ) : emojiLogo ? (
      <Text style={styles.headerEmojiLogo}>{emojiLogo}</Text>
    ) : null}
    <Text style={styles.headerTitleText} numberOfLines={1}>{name}</Text>
  </View>
);

const HeaderRight: React.FC<{
  onSearch: () => void;
  onMembers: () => void;
  onAdmin: () => void;
  onSettings: () => void;
  onLogout: () => void;
  showAdmin: boolean;
  showWinWall: boolean;
  onWinWall: () => void;
}> = ({ onSearch, onMembers, onAdmin, onSettings, onLogout, showAdmin, showWinWall, onWinWall }) => (
  <View style={styles.headerButtons}>
    {showWinWall && (
      <TouchableOpacity
        onPress={onWinWall}
        style={styles.headerButton}
        accessibilityRole="button"
        accessibilityLabel="Open Win Wall"
      >
        <Text style={{ fontSize: 22 }}>👑</Text>
      </TouchableOpacity>
    )}
    <TouchableOpacity onPress={onSearch} style={styles.headerButton}>
      <SearchHeaderIcon color={COLORS.surface} />
    </TouchableOpacity>
    <TouchableOpacity onPress={onMembers} style={styles.headerButton}>
      <MembersIcon color={COLORS.surface} />
    </TouchableOpacity>
    {showAdmin && (
      <TouchableOpacity onPress={onAdmin} style={styles.headerButton}>
        <ManageIcon color={COLORS.surface} />
      </TouchableOpacity>
    )}
    <TouchableOpacity onPress={onSettings} style={styles.headerButton}>
      <SettingsIcon color={COLORS.surface} />
    </TouchableOpacity>
    <TouchableOpacity onPress={onLogout} style={styles.headerButton}>
      <LogoutIcon color={COLORS.surface} />
    </TouchableOpacity>
  </View>
);

function ChatScreenContent() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ roomId?: string }>();
  const roomId = (params.roomId as ChatRoomId) || 'inner-circle';
  const roomConfig = ROOM_CONFIG[roomId] || ROOM_CONFIG['inner-circle'];
  const { user, isAdmin, isLoading: authLoading, signOut, isAuthenticated, profileError } = useAuth();
  const { setCurrentRoomId } = useRoom();

  // Set the current room in context when this screen loads or roomId changes
  useEffect(() => {
    setCurrentRoomId(roomId);
  }, [roomId, setCurrentRoomId]);

  // Redirect to login when user signs out
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated]);
  const {
    messages,
    isLoading,
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
    replyingTo,
    setReplyingTo,
    toggleReaction,
    editMessage,
    deleteMessage,
    checkCanEditMessage,
    failedMessages,
    retryMessage,
    dismissFailedMessage,
    chatLocked,
    canSendMessages,
  } = useChat();
  const [memberCount, setMemberCount] = useState(1);
  const [members, setMembers] = useState<User[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [selectedMessageForReaction, setSelectedMessageForReaction] = useState<Message | null>(null);
  const [showPollModal, setShowPollModal] = useState(false);
  const messageListRef = useRef<{ scrollToMessage: (messageId: string) => void } | null>(null);

  // Pin handlers
  const handlePinMessage = useCallback(async (messageId: string, duration: PinDuration) => {
    if (!user?.id) return;
    await pinMessage(messageId, user.id, isAdmin, roomId, duration);
  }, [user?.id, isAdmin, roomId]);

  const handleUnpinMessage = useCallback(async (messageId: string) => {
    await unpinMessage(messageId, isAdmin, roomId);
  }, [isAdmin, roomId]);

  // Poll handlers
  const handleCreatePoll = useCallback(async (
    question: string,
    options: string[],
    pollType: PollType,
    isAnonymous: boolean,
    expiresAt: Date | null
  ) => {
    if (!user?.id || !user?.displayName) return;
    await createPoll(
      user.id,
      user.displayName,
      question,
      options,
      pollType,
      isAnonymous,
      expiresAt,
      user.avatarUrl,
      roomId
    );
  }, [user?.id, user?.displayName, user?.avatarUrl, roomId]);

  const handleClosePoll = useCallback(async (messageId: string) => {
    await closePoll(messageId, roomId);
  }, [roomId]);

  const handleReopenPoll = useCallback(async (messageId: string) => {
    await reopenPoll(messageId, roomId);
  }, [roomId]);

  const handleScrollToMessage = useCallback((messageId: string) => {
    if (messageListRef.current) {
      messageListRef.current.scrollToMessage(messageId);
    }
  }, []);

  // Memoized handlers to avoid recreating functions
  const handleBackToRooms = useCallback(() => {
    router.replace('/(main)/rooms');
  }, [router]);

  const handleOpenMenu = useCallback(() => {
    setMenuVisible(true);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setShowSearch(true);
  }, []);

  const handleNavigateToMembers = useCallback(() => {
    router.push('/(main)/members');
  }, [router]);

  const handleNavigateToAdmin = useCallback(() => {
    router.push('/(admin)/manage');
  }, [router]);

  const handleNavigateToSettings = useCallback(() => {
    router.push('/(main)/settings');
  }, [router]);

  const handleLogout = useCallback(async () => {
    if (typeof window !== 'undefined' && window.confirm('Are you sure you want to log out?')) {
      await signOut();
      router.replace('/(auth)/login');
    }
  }, [signOut, router]);

  // Set navigation options using useEffect to avoid controlled/uncontrolled issues
  useEffect(() => {
    navigation.setOptions({
      title: roomConfig.name,
      headerStyle: {
        backgroundColor: COLORS.primary,
      },
      headerTintColor: COLORS.surface,
      headerTitleStyle: {
        fontWeight: '600',
      },
      headerTitle: () => (
        <HeaderTitle name={roomConfig.name} logo={roomConfig.logo} emojiLogo={roomConfig.emojiLogo} />
      ),
      headerLeft: () => (
        <HeaderLeft onBack={handleBackToRooms} onMenu={handleOpenMenu} />
      ),
      headerRight: () => (
        <HeaderRight
          onSearch={handleOpenSearch}
          onMembers={handleNavigateToMembers}
          onAdmin={handleNavigateToAdmin}
          onSettings={handleNavigateToSettings}
          onLogout={handleLogout}
          showAdmin={!!isAdmin}
          showWinWall={roomId === 'growth-lab'}
          onWinWall={() => router.push('/(main)/win-wall')}
        />
      ),
    });
  }, [
    navigation,
    roomConfig.name,
    roomConfig.logo,
    isAdmin,
    handleBackToRooms,
    handleOpenMenu,
    handleOpenSearch,
    handleLogout,
    handleNavigateToMembers,
    handleNavigateToAdmin,
    handleNavigateToSettings,
    roomId,
    router,
  ]);

  useEffect(() => {
    // Wait until the user is authenticated — Firestore rules require auth for
    // reading /users, so an early call returns permission-denied and leaves
    // members empty forever (breaking @mentions).
    if (!isAuthenticated || !user?.id) return;

    const fetchMembersData = async () => {
      try {
        const community = await getCommunity();
        if (community) {
          setMemberCount(community.memberIds?.length || 1);
        }
        // Fetch members for @mention functionality
        const memberList = await getMembers();
        setMembers(memberList);
      } catch (error) {
        console.error('Error fetching members:', error);
      }
    };
    fetchMembersData();
  }, [isAuthenticated, user?.id]);

  const handleOpenReactionPicker = (message: Message) => {
    setSelectedMessageForReaction(message);
    setReactionPickerVisible(true);
  };

  const handleSelectReaction = async (emoji: string) => {
    if (selectedMessageForReaction) {
      await toggleReaction(selectedMessageForReaction.id, emoji);
    }
    setReactionPickerVisible(false);
    setSelectedMessageForReaction(null);
  };

  // Show loading while auth is initializing
  if (authLoading) {
    return <LoadingSpinner fullScreen message="Loading..." />;
  }

  // Authenticated but the profile hasn't loaded yet, or failed to load
  // (transient). Show loading instead of evaluating access — otherwise a
  // momentarily-empty `user` reads as "no subscription" and a paying member
  // gets redirected out (the classic "access denied right after an update").
  // AuthContext auto-retries the profile load.
  if (isAuthenticated && (!user || profileError)) {
    return <LoadingSpinner fullScreen message="Loading your profile..." />;
  }

  // Check subscription access - redirect if user doesn't have access to this room.
  // Uses the canonical access predicate (status + tier + admin) so the client
  // matches firestore.rules exactly — single source of truth, no drift.
  const canEnterRoom = roomId === 'inner-circle'
    ? hasRoomTierAccess(user, 'all-access')
    : hasRoomTierAccess(user, 'standard');

  if (!canEnterRoom) {
    // Redirect to rooms screen if user doesn't have access
    router.replace('/(main)/rooms');
    return <LoadingSpinner fullScreen message="Checking access..." />;
  }

  return (
    <View style={styles.container}>
      <MenuDropdown
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        roomId={roomId}
        hasAudioLibraryAccess={isAdmin || roomId === 'growth-lab'}
      />
      <ImageBackground
        source={roomConfig.logo}
        style={styles.container}
        imageStyle={styles.backgroundImage}
        resizeMode="contain"
      >
        {showSearch && (
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            onClose={() => {
              setShowSearch(false);
              setSearchQuery('');
            }}
            isSearching={isSearching}
            resultCount={searchResults.length}
          />
        )}
        {isOffline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>You're offline. Messages will be sent when you reconnect.</Text>
          </View>
        )}
        {/* Pinned Messages Banner - wrapped to prevent errors from crashing chat */}
        <ComponentErrorBoundary>
          <PinnedMessagesBanner
            roomId={roomId}
            isAdmin={isAdmin}
            userId={user?.id}
            onScrollToMessage={handleScrollToMessage}
          />
        </ComponentErrorBoundary>
        <MessageList
          ref={messageListRef}
          messages={showSearch && searchQuery ? searchResults : messages}
          currentUserId={user?.id || ''}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          onLoadMore={loadMoreMessages}
          totalMembers={memberCount}
          onReply={setReplyingTo}
          onReaction={handleOpenReactionPicker}
          onToggleReaction={toggleReaction}
          onEdit={editMessage}
          onDelete={deleteMessage}
          checkCanEdit={checkCanEditMessage}
          isAdmin={isAdmin}
          onPin={handlePinMessage}
          onUnpin={handleUnpinMessage}
          roomId={roomId}
          onClosePoll={handleClosePoll}
          onReopenPoll={handleReopenPoll}
          members={members}
        />
        {!showSearch && typingUsers.length > 0 && (
          <TypingIndicator typingUsers={typingUsers} />
        )}
        {!showSearch && (
          <>
            {/* Image Upload Error Banner */}
            {imageError && (
              <View style={{ backgroundColor: '#ef4444', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#fff', fontSize: 13, flex: 1 }}>Image upload failed: {imageError}</Text>
                <TouchableOpacity onPress={clearImageError} style={{ marginLeft: 12, padding: 4 }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>×</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* Failed Messages Banner */}
            <FailedMessageBanner
              failedMessages={failedMessages}
              onRetry={retryMessage}
              onDismiss={dismissFailedMessage}
            />
            {replyingTo && (
              <View style={styles.replyBar}>
                <View style={styles.replyBarLeft}>
                  <View style={styles.replyBarAccent} />
                  <View style={styles.replyBarContent}>
                    <Text style={styles.replyBarName}>{replyingTo.senderName}</Text>
                    <Text style={styles.replyBarText} numberOfLines={1}>
                      {replyingTo.type === 'image' ? '📷 Photo' : replyingTo.type === 'voice' ? '🎤 Voice note' : replyingTo.content}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.replyBarClose}
                  onPress={() => setReplyingTo(null)}
                >
                  <Text style={styles.replyBarCloseText}>×</Text>
                </TouchableOpacity>
              </View>
            )}
            <MessageInput
              onSend={sendMessage}
              onSendImage={sendImage}
              onSendVoiceNote={sendVoiceNote}
              isUploadingImage={isUploadingImage}
              onTyping={onUserTyping}
              chatLocked={chatLocked}
              canSendMessages={canSendMessages}
              isAdmin={isAdmin}
              onCreatePoll={() => setShowPollModal(true)}
              members={members}
            />
          </>
        )}
      </ImageBackground>
      <ReactionPicker
        visible={reactionPickerVisible}
        onClose={() => {
          setReactionPickerVisible(false);
          setSelectedMessageForReaction(null);
        }}
        onSelectReaction={handleSelectReaction}
      />
      <CreatePollModal
        visible={showPollModal}
        onClose={() => setShowPollModal(false)}
        onCreatePoll={handleCreatePoll}
      />
    </View>
  );
}

// Members/Group icon
const MembersIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.container}>
    <View style={[iconStyles.personHead, { backgroundColor: color }]} />
    <View style={[iconStyles.personBody, { backgroundColor: color }]} />
    <View style={[iconStyles.personHead2, { backgroundColor: color }]} />
    <View style={[iconStyles.personBody2, { backgroundColor: color }]} />
  </View>
);

// Settings/Gear icon
const SettingsIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.container}>
    <View style={[iconStyles.settingsOuter, { borderColor: color }]} />
    <View style={[iconStyles.settingsInner, { backgroundColor: color }]} />
  </View>
);

// Logout icon (door with arrow)
const LogoutIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.container}>
    <View style={[iconStyles.logoutDoor, { borderColor: color }]} />
    <View style={[iconStyles.logoutArrow, { backgroundColor: color }]} />
    <View style={[iconStyles.logoutArrowHead, { borderColor: color }]} />
  </View>
);

// Manage/Admin icon
const ManageIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.container}>
    <View style={[iconStyles.manageBar, { backgroundColor: color }]} />
    <View style={[iconStyles.manageBar, iconStyles.manageBar2, { backgroundColor: color }]} />
    <View style={[iconStyles.manageBar, iconStyles.manageBar3, { backgroundColor: color }]} />
  </View>
);

// Menu/Hamburger icon
const MenuIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.container}>
    <View style={[iconStyles.menuLine, { backgroundColor: color }]} />
    <View style={[iconStyles.menuLine, iconStyles.menuLine2, { backgroundColor: color }]} />
    <View style={[iconStyles.menuLine, iconStyles.menuLine3, { backgroundColor: color }]} />
  </View>
);

// Back arrow icon
const BackIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.container}>
    <View style={[iconStyles.backArrowTop, { backgroundColor: color }]} />
    <View style={[iconStyles.backArrowBottom, { backgroundColor: color }]} />
  </View>
);

// Search icon for header
const SearchHeaderIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.container}>
    <View style={[iconStyles.searchCircle, { borderColor: color }]} />
    <View style={[iconStyles.searchHandle, { backgroundColor: color }]} />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.chatBackground,
  },
  backgroundImage: {
    opacity: 0.3,
    width: '70%',
    height: '70%',
    alignSelf: 'center',
    top: '15%',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  headerLogo: {
    width: 26,
    height: 26,
    marginRight: 4,
  },
  headerEmojiLogo: {
    fontSize: 22,
    lineHeight: 26,
    marginRight: 6,
  },
  headerTitleText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.surface,
    flexShrink: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerLeftButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineBanner: {
    backgroundColor: '#FFA500',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
  },
  offlineText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  replyBarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyBarAccent: {
    width: 3,
    height: 36,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginRight: SPACING.sm,
  },
  replyBarContent: {
    flex: 1,
  },
  replyBarName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 2,
  },
  replyBarText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  replyBarClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  replyBarCloseText: {
    fontSize: 18,
    color: COLORS.textSecondary,
    fontWeight: '300',
    marginTop: -2,
  },
});

const iconStyles = StyleSheet.create({
  container: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Members icon
  personHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    top: 2,
    left: 3,
  },
  personBody: {
    width: 12,
    height: 8,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    position: 'absolute',
    bottom: 4,
    left: 1,
  },
  personHead2: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    top: 4,
    right: 3,
  },
  personBody2: {
    width: 10,
    height: 6,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    position: 'absolute',
    bottom: 4,
    right: 1,
  },
  // Settings icon
  settingsOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
  },
  settingsInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
  },
  // Manage icon
  manageBar: {
    width: 18,
    height: 3,
    borderRadius: 1.5,
    position: 'absolute',
    top: 5,
  },
  manageBar2: {
    top: 10,
  },
  manageBar3: {
    top: 15,
  },
  // Menu icon
  menuLine: {
    width: 20,
    height: 2,
    borderRadius: 1,
    position: 'absolute',
    top: 6,
  },
  menuLine2: {
    top: 11,
  },
  menuLine3: {
    top: 16,
  },
  // Search icon
  searchCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    position: 'absolute',
    top: 2,
    left: 2,
  },
  searchHandle: {
    width: 7,
    height: 2,
    borderRadius: 1,
    position: 'absolute',
    bottom: 4,
    right: 2,
    transform: [{ rotate: '45deg' }],
  },
  // Back arrow icon
  backArrowTop: {
    width: 10,
    height: 2,
    borderRadius: 1,
    position: 'absolute',
    top: 8,
    left: 5,
    transform: [{ rotate: '-45deg' }],
  },
  backArrowBottom: {
    width: 10,
    height: 2,
    borderRadius: 1,
    position: 'absolute',
    bottom: 8,
    left: 5,
    transform: [{ rotate: '45deg' }],
  },
  // Logout icon
  logoutDoor: {
    width: 12,
    height: 16,
    borderWidth: 2,
    borderRightWidth: 0,
    borderRadius: 2,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    position: 'absolute',
    left: 2,
  },
  logoutArrow: {
    width: 10,
    height: 2,
    borderRadius: 1,
    position: 'absolute',
    right: 2,
  },
  logoutArrowHead: {
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 5,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    position: 'absolute',
    right: 2,
  },
});

// Auth loading gate - prevents ChatScreenContent from rendering until auth is ready
function ChatScreenWithAuth() {
  const { isLoading: authLoading } = useAuth();

  // Wait for auth to finish loading before rendering the chat content
  // This prevents hooks inside ChatScreenContent from running before auth state is known
  if (authLoading) {
    return <LoadingSpinner fullScreen message="Loading..." />;
  }

  return <ChatScreenContent />;
}

// Export with error boundary wrapper
export default function ChatScreen() {
  return (
    <ScreenErrorBoundary screenType="chat">
      <ChatScreenWithAuth />
    </ScreenErrorBoundary>
  );
}
