import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  Platform,
  Pressable,
  Modal,
} from 'react-native';
import { Message, Poll, PollOption, PinDuration, User } from '../../types';
import { COLORS, SPACING } from '../../constants/config';
import { formatMessageTime } from '../../utils/formatters';
import {
  votePoll,
  hasUserVoted,
  isPollExpired,
  isPollActive,
  getPollTimeRemaining,
  getOptionPercentage,
  getUserVotedOptions,
} from '../../services/polls';
import { ChatRoomId } from '../../types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

// Pin duration options
const PIN_DURATION_OPTIONS: { value: PinDuration; label: string; description: string }[] = [
  { value: '24h', label: '24 Hours', description: 'Pin for one day' },
  { value: '1w', label: '1 Week', description: 'Pin for seven days' },
  { value: '1m', label: '1 Month', description: 'Pin for thirty days' },
  { value: 'forever', label: 'Forever', description: 'Pin indefinitely' },
];

interface PollBubbleProps {
  message: Message;
  currentUserId: string;
  isAdmin?: boolean;
  roomId?: ChatRoomId;
  onClosePoll?: (messageId: string) => Promise<void>;
  onReopenPoll?: (messageId: string) => Promise<void>;
  onPin?: (messageId: string, duration: PinDuration) => Promise<void>;
  onUnpin?: (messageId: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  members?: User[];
}

export const PollBubble: React.FC<PollBubbleProps> = ({
  message,
  currentUserId,
  isAdmin = false,
  roomId,
  onClosePoll,
  onReopenPoll,
  onPin,
  onUnpin,
  onDelete,
  members = [],
}) => {
  const poll = message.poll;
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [isVoting, setIsVoting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
  const [localPoll, setLocalPoll] = useState<Poll | undefined>(poll);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showPinDurationModal, setShowPinDurationModal] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [voterModalOption, setVoterModalOption] = useState<PollOption | null>(null);
  const [voterNames, setVoterNames] = useState<Record<string, string>>({});
  const [loadingVoters, setLoadingVoters] = useState(false);

  // Fetch voter display names when modal opens
  const fetchVoterNames = useCallback(async (voterIds: string[]) => {
    setLoadingVoters(true);
    const names: Record<string, string> = {};
    try {
      // First try to resolve from members prop
      for (const id of voterIds) {
        const member = members.find((m) => m.id === id);
        if (member) {
          names[id] = member.displayName;
        }
      }
      // For any unresolved, fetch directly from Firestore
      const unresolved = voterIds.filter((id) => !names[id]);
      await Promise.all(
        unresolved.map(async (id) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', id));
            if (userDoc.exists()) {
              names[id] = (userDoc.data() as any).displayName || 'Unknown member';
            }
          } catch {
            // ignore individual fetch errors
          }
        })
      );
    } catch (error) {
      console.error('Error fetching voter names:', error);
    }
    setVoterNames(names);
    setLoadingVoters(false);
  }, [members]);

  const openVoterModal = useCallback((option: PollOption) => {
    setVoterModalOption(option);
    if (option.voterIds.length > 0) {
      fetchVoterNames(option.voterIds);
    }
  }, [fetchVoterNames]);

  // Update local poll when message changes
  useEffect(() => {
    setLocalPoll(message.poll);
  }, [message.poll]);

  // Update time remaining every minute
  useEffect(() => {
    if (!localPoll) return;

    const updateTime = () => {
      setTimeRemaining(getPollTimeRemaining(localPoll));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [localPoll]);

  if (!localPoll) {
    return null;
  }

  const userHasVoted = hasUserVoted(localPoll, currentUserId);
  const pollIsActive = isPollActive(localPoll);
  const pollExpired = isPollExpired(localPoll);
  const userVotedOptions = getUserVotedOptions(localPoll, currentUserId);

  const handleOptionSelect = (optionId: string) => {
    if (!pollIsActive || userHasVoted) return;

    if (localPoll.pollType === 'single') {
      setSelectedOptions([optionId]);
    } else {
      // Multiple choice
      if (selectedOptions.includes(optionId)) {
        setSelectedOptions(selectedOptions.filter((id) => id !== optionId));
      } else {
        setSelectedOptions([...selectedOptions, optionId]);
      }
    }
  };

  const handleVote = async () => {
    if (selectedOptions.length === 0) {
      const alertMsg = 'Please select at least one option';
      if (Platform.OS === 'web') {
        window.alert(alertMsg);
      } else {
        Alert.alert('No Selection', alertMsg);
      }
      return;
    }

    setIsVoting(true);
    try {
      await votePoll(message.id, currentUserId, selectedOptions, roomId);
      setSelectedOptions([]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to vote';
      if (Platform.OS === 'web') {
        window.alert(errorMsg);
      } else {
        Alert.alert('Vote Failed', errorMsg);
      }
    } finally {
      setIsVoting(false);
    }
  };

  const handleClosePoll = async () => {
    if (onClosePoll) {
      try {
        await onClosePoll(message.id);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to close poll';
        if (Platform.OS === 'web') {
          window.alert(errorMsg);
        } else {
          Alert.alert('Error', errorMsg);
        }
      }
    }
  };

  const handleReopenPoll = async () => {
    if (onReopenPoll) {
      try {
        await onReopenPoll(message.id);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to reopen poll';
        if (Platform.OS === 'web') {
          window.alert(errorMsg);
        } else {
          Alert.alert('Error', errorMsg);
        }
      }
    }
  };

  const isOwnPoll = message.senderId === currentUserId;

  // Handle long press to show action menu (for admins or own polls)
  const handleLongPress = () => {
    if (isAdmin || isOwnPoll) {
      setShowActionMenu(true);
    }
  };

  // Handle pin with duration
  const handlePinWithDuration = async (duration: PinDuration) => {
    if (!onPin) return;

    setIsPinning(true);
    try {
      await onPin(message.id, duration);
      setShowPinDurationModal(false);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to pin poll';
      if (Platform.OS === 'web') {
        window.alert(errorMsg);
      } else {
        Alert.alert('Pin Failed', errorMsg);
      }
    } finally {
      setIsPinning(false);
    }
  };

  // Handle unpin
  const handleUnpin = async () => {
    if (!onUnpin) return;

    try {
      await onUnpin(message.id);
      setShowActionMenu(false);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to unpin poll';
      if (Platform.OS === 'web') {
        window.alert(errorMsg);
      } else {
        Alert.alert('Unpin Failed', errorMsg);
      }
    }
  };

  const renderOption = (option: PollOption) => {
    const percentage = getOptionPercentage(option, localPoll.totalVotes);
    const isSelected = selectedOptions.includes(option.id);
    const userVotedForThis = userVotedOptions.includes(option.id);
    const showResults = userHasVoted || !pollIsActive || isAdmin;

    // When results are visible and poll is non-anonymous, tap shows voters
    // Admins can always see voters; regular users can after voting or when poll is closed
    const canShowVoters = showResults && !localPoll.isAnonymous && option.voteCount > 0
      && (userHasVoted || !pollIsActive || isAdmin);

    const handlePress = () => {
      if (canShowVoters) {
        openVoterModal(option);
      } else {
        handleOptionSelect(option.id);
      }
    };

    return (
      <TouchableOpacity
        key={option.id}
        style={[
          styles.optionContainer,
          isSelected && styles.optionSelected,
          userVotedForThis && styles.optionVoted,
        ]}
        onPress={handlePress}
        disabled={!pollIsActive && !canShowVoters}
        activeOpacity={0.7}
      >
        <View style={styles.optionContent}>
          <View style={styles.optionLeft}>
            {/* Selection indicator - show when user hasn't voted and poll is active */}
            {(!userHasVoted && pollIsActive) && (
              <TouchableOpacity
                onPress={() => handleOptionSelect(option.id)}
                activeOpacity={0.6}
                style={[
                  styles.selectionIndicator,
                  localPoll.pollType === 'single' ? styles.radioOuter : styles.checkboxOuter,
                  isSelected && styles.selectionIndicatorSelected,
                ]}
              >
                {isSelected && (
                  <View
                    style={[
                      localPoll.pollType === 'single' ? styles.radioInner : styles.checkboxInner,
                    ]}
                  />
                )}
              </TouchableOpacity>
            )}
            <Text style={[styles.optionText, userVotedForThis && styles.optionTextVoted]}>
              {option.text}
            </Text>
            {userVotedForThis && <Text style={styles.votedIndicator}> (You)</Text>}
            {canShowVoters && <Text style={styles.voterHint}> 👁</Text>}
          </View>

          {showResults && (
            <Text style={styles.voteCount}>
              {percentage}% ({option.voteCount})
            </Text>
          )}
        </View>

        {/* Progress bar */}
        {showResults && (
          <View style={styles.progressBarContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                { width: `${percentage}%` },
                userVotedForThis && styles.progressBarVoted,
              ]}
            />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={500}
      style={[styles.container, isOwnPoll ? styles.ownPollContainer : styles.otherPollContainer]}
    >
      {/* Pinned indicator */}
      {message.isPinned && (
        <View style={styles.pinnedIndicator}>
          <Text style={styles.pinnedIcon}>📌</Text>
          <Text style={styles.pinnedText}>Pinned</Text>
        </View>
      )}

      {/* Poll header */}
      <View style={styles.header}>
        <Text style={styles.pollIcon}>📊</Text>
        <Text style={styles.pollLabel}>POLL</Text>
        {localPoll.pollType === 'multiple' && (
          <Text style={styles.pollTypeLabel}>(Multiple choice)</Text>
        )}
      </View>

      {/* Question */}
      <Text style={styles.question}>{localPoll.question}</Text>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {localPoll.options.map(renderOption)}
      </View>

      {/* Vote button */}
      {pollIsActive && !userHasVoted && (
        <TouchableOpacity
          style={[styles.voteButton, selectedOptions.length === 0 && styles.voteButtonDisabled]}
          onPress={handleVote}
          disabled={isVoting || selectedOptions.length === 0}
        >
          <Text style={styles.voteButtonText}>
            {isVoting ? 'Voting...' : 'Vote'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Poll info footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={styles.totalVotes}>
            {localPoll.totalVotes} {localPoll.totalVotes === 1 ? 'vote' : 'votes'}
          </Text>

          {localPoll.isClosed && (
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>Closed</Text>
            </View>
          )}

          {pollExpired && !localPoll.isClosed && (
            <View style={[styles.statusBadge, styles.expiredBadge]}>
              <Text style={styles.statusBadgeText}>Expired</Text>
            </View>
          )}
        </View>

        <View style={styles.footerRight}>
          {timeRemaining && !localPoll.isClosed && !pollExpired && (
            <Text style={styles.timeRemaining}>⏱ {timeRemaining}</Text>
          )}

          <Text style={styles.anonymousIndicator}>
            {localPoll.isAnonymous ? '🔒 Anonymous' : '👁 Visible'}
          </Text>
        </View>
      </View>

      {/* Admin controls */}
      {isAdmin && (
        <View style={styles.adminControls}>
          <View style={styles.adminButtonRow}>
            {localPoll.isClosed ? (
              <TouchableOpacity
                style={styles.adminButton}
                onPress={handleReopenPoll}
              >
                <Text style={styles.adminButtonText}>Reopen Poll</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.adminButton, styles.closeButton]}
                onPress={handleClosePoll}
              >
                <Text style={styles.adminButtonText}>Close Poll</Text>
              </TouchableOpacity>
            )}
            {/* Pin/Unpin button */}
            {message.isPinned ? (
              <TouchableOpacity
                style={[styles.adminButton, styles.unpinButton]}
                onPress={handleUnpin}
              >
                <Text style={styles.adminButtonText}>📌 Unpin</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.adminButton, styles.pinButton]}
                onPress={() => setShowPinDurationModal(true)}
              >
                <Text style={styles.adminButtonText}>📍 Pin</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}


      {/* Timestamp */}
      <Text style={styles.timestamp}>
        {formatMessageTime(message.timestamp)}
      </Text>

      {/* Action Menu Modal (for admins) */}
      <Modal
        visible={showActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionMenu(false)}
      >
        <Pressable
          style={styles.actionMenuOverlay}
          onPress={() => setShowActionMenu(false)}
        >
          <View style={styles.actionMenuContainer}>
            {/* Pin/Unpin option - admins only */}
            {isAdmin && (
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => {
                  setShowActionMenu(false);
                  if (message.isPinned) {
                    handleUnpin();
                  } else {
                    setShowPinDurationModal(true);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={message.isPinned ? 'Unpin poll' : 'Pin poll'}
              >
                <Text style={styles.actionMenuIcon}>{message.isPinned ? '📌' : '📍'}</Text>
                <Text style={styles.actionMenuText}>{message.isPinned ? 'Unpin' : 'Pin'}</Text>
              </TouchableOpacity>
            )}
            {/* Delete option - only for admins */}
            {isAdmin && onDelete && (
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => {
                  setShowActionMenu(false);
                  const confirmDelete = () => {
                    onDelete(message.id).catch((error) => {
                      const errorMsg = error instanceof Error ? error.message : 'Failed to delete poll';
                      if (Platform.OS === 'web') {
                        window.alert(errorMsg);
                      } else {
                        Alert.alert('Delete Failed', errorMsg);
                      }
                    });
                  };
                  if (Platform.OS === 'web') {
                    if (window.confirm('Delete this poll? This cannot be undone.')) {
                      confirmDelete();
                    }
                  } else {
                    Alert.alert(
                      'Delete Poll',
                      'Delete this poll? This cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
                      ]
                    );
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete poll"
              >
                <Text style={styles.actionMenuIcon}>🗑️</Text>
                <Text style={[styles.actionMenuText, styles.actionMenuDeleteText]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Pin Duration Modal */}
      <Modal
        visible={showPinDurationModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPinDurationModal(false)}
      >
        <Pressable
          style={styles.pinDurationOverlay}
          onPress={() => setShowPinDurationModal(false)}
        >
          <Pressable
            style={styles.pinDurationContainer}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pinDurationHeader}>
              <Text style={styles.pinDurationTitle}>📌 Pin Poll</Text>
              <TouchableOpacity
                onPress={() => setShowPinDurationModal(false)}
                style={styles.pinDurationCloseButton}
              >
                <Text style={styles.pinDurationCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.pinDurationSubtitle}>
              How long should this poll be pinned?
            </Text>
            <View style={styles.pinDurationOptions}>
              {PIN_DURATION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.pinDurationOption,
                    isPinning && styles.pinDurationOptionDisabled,
                  ]}
                  onPress={() => handlePinWithDuration(option.value)}
                  disabled={isPinning}
                >
                  <View style={styles.pinDurationOptionContent}>
                    <Text style={styles.pinDurationOptionLabel}>{option.label}</Text>
                    <Text style={styles.pinDurationOptionDesc}>{option.description}</Text>
                  </View>
                  <Text style={styles.pinDurationOptionArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
            {isPinning && (
              <Text style={styles.pinDurationLoading}>Pinning poll...</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Voter List Modal */}
      <Modal
        visible={voterModalOption !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setVoterModalOption(null)}
      >
        <Pressable
          style={styles.voterModalOverlay}
          onPress={() => setVoterModalOption(null)}
        >
          <Pressable
            style={styles.voterModalContainer}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.voterModalHeader}>
              <Text style={styles.voterModalTitle} numberOfLines={2}>
                {voterModalOption?.text}
              </Text>
              <TouchableOpacity
                onPress={() => setVoterModalOption(null)}
                style={styles.voterModalClose}
              >
                <Text style={styles.voterModalCloseText}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.voterModalSubtitle}>
              {voterModalOption?.voteCount} {voterModalOption?.voteCount === 1 ? 'vote' : 'votes'}
            </Text>
            <View style={styles.voterList}>
              {loadingVoters ? (
                <Text style={styles.voterModalSubtitle}>Loading...</Text>
              ) : voterModalOption?.voterIds.map((voterId) => {
                const name = voterNames[voterId];
                return (
                  <View key={voterId} style={styles.voterItem}>
                    <View style={styles.voterAvatar}>
                      <Text style={styles.voterAvatarText}>
                        {(name || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.voterName}>
                      {name || 'Unknown member'}
                      {voterId === currentUserId ? ' (You)' : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: SPACING.md,
    marginVertical: SPACING.xs,
    marginHorizontal: SPACING.sm,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  ownPollContainer: {
    alignSelf: 'flex-end',
    backgroundColor: '#ffffff',
  },
  otherPollContainer: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  pollIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  pollLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  pollTypeLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    marginLeft: SPACING.xs,
  },
  question: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.md,
    lineHeight: 22,
  },
  optionsContainer: {
    gap: SPACING.sm,
  },
  optionContainer: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fafafa',
    overflow: 'hidden',
  },
  optionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(254, 42, 148, 0.05)',
  },
  optionVoted: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(254, 42, 148, 0.08)',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectionIndicator: {
    marginRight: SPACING.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  checkboxOuter: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  selectionIndicatorSelected: {
    borderColor: COLORS.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  optionText: {
    fontSize: 15,
    color: COLORS.text,
    flex: 1,
  },
  optionTextVoted: {
    fontWeight: '600',
  },
  votedIndicator: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },
  voterHint: {
    fontSize: 12,
    color: COLORS.textLight,
    marginLeft: 4,
  },
  voteCount: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#e5e5e5',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.border,
    borderRadius: 2,
  },
  progressBarVoted: {
    backgroundColor: COLORS.primary,
  },
  voteButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  voteButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  voteButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  totalVotes: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  statusBadge: {
    backgroundColor: COLORS.textLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  expiredBadge: {
    backgroundColor: COLORS.warning,
  },
  statusBadgeText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '600',
  },
  timeRemaining: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  anonymousIndicator: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  adminControls: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  adminButtonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  adminButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  closeButton: {
    backgroundColor: COLORS.textLight,
  },
  pinButton: {
    backgroundColor: '#4A90D9',
  },
  unpinButton: {
    backgroundColor: '#E57373',
  },
  adminButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: SPACING.sm,
    textAlign: 'right',
  },
  // Pinned indicator styles
  pinnedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(254, 42, 148, 0.1)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: SPACING.sm,
    alignSelf: 'flex-start',
  },
  pinnedIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  pinnedText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  // Action menu styles
  actionMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionMenuContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  actionMenuIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  actionMenuText: {
    fontSize: 16,
    color: COLORS.text,
  },
  actionMenuDeleteText: {
    color: '#FF3B30',
  },
  // Pin duration modal styles
  pinDurationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pinDurationContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  pinDurationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pinDurationTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  pinDurationCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinDurationCloseText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  pinDurationSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  pinDurationOptions: {
    paddingHorizontal: SPACING.md,
  },
  pinDurationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginVertical: 4,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  pinDurationOptionDisabled: {
    opacity: 0.5,
  },
  pinDurationOptionContent: {
    flex: 1,
  },
  pinDurationOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  pinDurationOptionDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  pinDurationOptionArrow: {
    fontSize: 24,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  pinDurationLoading: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    paddingVertical: SPACING.md,
    fontStyle: 'italic',
  },
  voterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voterModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: SPACING.lg,
    width: '80%',
    maxWidth: 340,
    maxHeight: '60%',
  },
  voterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  voterModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  voterModalClose: {
    padding: 4,
  },
  voterModalCloseText: {
    fontSize: 22,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  voterModalSubtitle: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: SPACING.md,
  },
  voterList: {
    gap: 10,
  },
  voterItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voterAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  voterAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  voterName: {
    fontSize: 14,
    color: COLORS.text,
  },
});

export default PollBubble;
