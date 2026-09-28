import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Modal,
  TouchableOpacity,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MemberList } from '../../components/members/MemberList';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import {
  getMembers,
  addMember,
  removeMember,
  findUserByPhone,
  grantEliteAccess,
  revokeEliteAccess,
  grantStandardAccess,
  revokeStandardAccess,
  getRoomSettings,
  setRoomChatLock,
  addRoomAllowedSpeaker,
  removeRoomAllowedSpeaker,
  addRoomInvitedUser,
  removeRoomInvitedUser,
  getCommunity,
  promoteToAdmin,
  demoteFromAdmin,
} from '../../services/admin';
import { callFunction } from '../../services/firebase';
import {
  createInvite,
  createEmailInvite,
  getPendingInvites,
  cancelInvite,
  generateInviteMessage,
  generateEmailInviteMessage,
  generateInviteLink,
  Invite,
} from '../../services/invites';
import { User, ChatRoomId, RoomSettings } from '../../types';
import { COLORS, SPACING, CHAT_ROOMS } from '../../constants/config';

const RICH_GIRL_ROOM_ID: ChatRoomId = 'growth-lab';
const isGrowthLabRoomActive = (): boolean => {
  const cfg = CHAT_ROOMS[RICH_GIRL_ROOM_ID];
  if (!cfg) return false;
  const now = Date.now();
  if (cfg.activeFrom && now < new Date(cfg.activeFrom).getTime()) return false;
  if (cfg.activeUntil && now > new Date(cfg.activeUntil).getTime()) return false;
  return true;
};
import { validatePhoneNumber, formatPhoneForFirebase, validateEmail } from '../../utils/validators';
import { toDate } from '../../utils/formatters';
import { ScreenErrorBoundary } from '../../components/common/ScreenErrorBoundary';

function ManageScreenContent() {
  const router = useRouter();
  const { user, isAdmin, isLoading: authLoading } = useAuth();

  const [members, setMembers] = useState<User[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteMethod, setInviteMethod] = useState<'phone' | 'email'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState<Invite | null>(null);
  const [activeTab, setActiveTab] = useState<'members' | 'invites' | 'chatControl' | 'eliteAccess' | 'growthLab'>('members');
  const [growthLabInvitedIds, setGrowthLabInvitedIds] = useState<string[]>([]);
  const [togglingGrowthLabUserId, setTogglingGrowthLabUserId] = useState<string | null>(null);

  // Growth Lab — one-time migration tool state
  const [misroutedCandidates, setMisroutedCandidates] = useState<Array<{
    id: string;
    senderId: string;
    senderName: string;
    type: string;
    content: string;
    audioUrl: string | null;
    imageUrl: string | null;
    timestamp: number | null;
  }>>([]);
  const [isLoadingMisrouted, setIsLoadingMisrouted] = useState(false);
  const [migratingMessageId, setMigratingMessageId] = useState<string | null>(null);
  const [contentSearchQuery, setContentSearchQuery] = useState('');
  const [isSearchingContent, setIsSearchingContent] = useState(false);
  const [isTogglingLock, setIsTogglingLock] = useState(false);
  const [togglingEliteUserId, setTogglingEliteUserId] = useState<string | null>(null);
  const [togglingStandardUserId, setTogglingStandardUserId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  // Room-specific chat control state
  const [selectedRoomId, setSelectedRoomId] = useState<ChatRoomId>('inner-circle');
  const [chatLocked, setChatLocked] = useState(false);
  const [allowedSpeakers, setAllowedSpeakers] = useState<string[]>([]);

  // Maintenance state
  const [isFixingApostrophes, setIsFixingApostrophes] = useState(false);
  const [isDeletingTestMessages, setIsDeletingTestMessages] = useState(false);
  const [fixResult, setFixResult] = useState<string | null>(null);

  useEffect(() => {
    // Wait for auth to finish loading before checking permissions
    if (authLoading) return;

    if (!isAdmin) {
      router.back();
      return;
    }
    loadData();
  }, [isAdmin, authLoading]);

  // Load room settings when selected room changes or when viewing Chat Control tab
  useEffect(() => {
    if (activeTab === 'chatControl' && isAdmin) {
      loadRoomSettings(selectedRoomId);
    }
  }, [activeTab, isAdmin, selectedRoomId]);

  // Load Growth Lab invite list when viewing that tab
  useEffect(() => {
    if (activeTab === 'growthLab' && isAdmin) {
      loadGrowthLabInvites();
    }
  }, [activeTab, isAdmin]);

  const loadGrowthLabInvites = async () => {
    try {
      const settings = await getRoomSettings(RICH_GIRL_ROOM_ID);
      setGrowthLabInvitedIds(settings.invitedUserIds ?? []);
    } catch (error) {
      console.error('Error loading Growth Lab invites:', error);
    }
  };

  const handleScanMisroutedMessages = async () => {
    setIsLoadingMisrouted(true);
    try {
      const result = await callFunction<{ candidates: any[] }>('listMisroutedGrowthLabMessages', {
        sinceMinutes: 1440 * 7, // last 7 days
      });
      setMisroutedCandidates(result.candidates || []);
      if (!result.candidates || result.candidates.length === 0) {
        showAlert('No Candidates', 'No misrouted messages were found in the last 7 days.');
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to scan for misrouted messages');
    } finally {
      setIsLoadingMisrouted(false);
    }
  };

  const [growthLabDiagnostic, setGrowthLabDiagnostic] = useState<{
    invitedUsers: Array<{
      uid: string;
      isCommunityMember: boolean;
      displayName: string | null;
      userDocExists: boolean;
      subscriptionTier: string | null;
      subscriptionStatus: string | null;
      hasEliteAccess: boolean;
      role: string | null;
    }>;
    invitedCount: number;
    communityMemberCount: number;
  } | null>(null);
  const [repairingUid, setRepairingUid] = useState<string | null>(null);

  const handleRunGrowthLabDiagnostic = async () => {
    try {
      const result = await callFunction<any>('debugGrowthLabAccess', {});
      setGrowthLabDiagnostic(result);
      console.log('[GrowthLab Diagnostic]', result);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to run diagnostic');
    }
  };

  const handleRepairCommunityMember = async (uid: string, displayName: string | null) => {
    const confirmed = showConfirm(`Re-add ${displayName || uid} to the community? This restores their full community membership.`);
    if (!confirmed) return;
    setRepairingUid(uid);
    try {
      await callFunction('repairCommunityMembership', { uid });
      showAlert('Repaired', `${displayName || uid} is now a community member again.`);
      // Refresh the diagnostic
      await handleRunGrowthLabDiagnostic();
      // Refresh the regular members list so the UI updates everywhere
      await loadData();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to add user to community');
    } finally {
      setRepairingUid(null);
    }
  };

  const handleSearchByContent = async () => {
    const q = contentSearchQuery.trim();
    if (q.length < 3) {
      showAlert('Too Short', 'Enter at least 3 characters to search.');
      return;
    }
    setIsSearchingContent(true);
    try {
      const result = await callFunction<{ matches: any[] }>('searchCoreMessagesByContent', {
        query: q,
        sinceMinutes: 60 * 24 * 30, // last 30 days
      });
      setMisroutedCandidates(result.matches || []);
      if (!result.matches || result.matches.length === 0) {
        showAlert('No Matches', `No messages containing "${q}" were found in the last 30 days.`);
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to search messages');
    } finally {
      setIsSearchingContent(false);
    }
  };

  const handleMigrateMessage = async (messageId: string) => {
    const confirmed = showConfirm('Move this message from Northstar Coaching to Growth Lab?');
    if (!confirmed) return;
    setMigratingMessageId(messageId);
    try {
      await callFunction('migrateMessageToGrowthLab', { messageId });
      setMisroutedCandidates((prev) => prev.filter((c) => c.id !== messageId));
      showAlert('Moved', 'Message moved to Growth Lab.');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to move message');
    } finally {
      setMigratingMessageId(null);
    }
  };

  const handleToggleGrowthLabInvite = async (member: User) => {
    if (!user) return;
    setTogglingGrowthLabUserId(member.id);
    try {
      if (growthLabInvitedIds.includes(member.id)) {
        const confirmed = showConfirm(`Remove ${member.displayName} from Growth Lab?`);
        if (!confirmed) {
          setTogglingGrowthLabUserId(null);
          return;
        }
        await removeRoomInvitedUser(user.id, RICH_GIRL_ROOM_ID, member.id);
        showAlert('Removed', `${member.displayName} no longer has access to Growth Lab.`);
      } else {
        await addRoomInvitedUser(user.id, RICH_GIRL_ROOM_ID, member.id);
        showAlert('Added', `${member.displayName} has been added to Growth Lab.`);
      }
      await loadGrowthLabInvites();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to update access');
    } finally {
      setTogglingGrowthLabUserId(null);
    }
  };

  const loadRoomSettings = async (roomId: ChatRoomId) => {
    try {
      const settings = await getRoomSettings(roomId);
      setChatLocked(settings.chatLocked ?? false);
      setAllowedSpeakers(settings.allowedSpeakers ?? []);
    } catch (error) {
      console.error('Error loading room settings:', error);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    // Safety net: bound each call so a hung request (e.g. a stalled fetch)
    // can never leave the panel spinning forever. On timeout the call resolves
    // to a safe fallback and the panel renders with whatever loaded.
    const withTimeout = <T,>(p: Promise<T>, fallback: T, ms = 15000): Promise<T> =>
      Promise.race([
        p.catch(() => fallback),
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);
    try {
      const [memberList, invites, community] = await Promise.all([
        withTimeout(getMembers(), [] as User[]),
        withTimeout(getPendingInvites(), [] as Invite[]),
        withTimeout(getCommunity(), null),
      ]);
      setMembers(memberList);
      setPendingInvites(invites);
      if (community) {
        setOwnerId(community.adminId);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    }
  };

  const showConfirm = (message: string): boolean => {
    if (Platform.OS === 'web') {
      return window.confirm(message);
    }
    return false;
  };

  const handleInviteMember = async () => {
    if (inviteMethod === 'phone') {
      if (!validatePhoneNumber(phoneNumber)) {
        showAlert('Invalid Phone', 'Please enter a valid phone number.');
        return;
      }

      setIsInviting(true);
      try {
        const formattedPhone = formatPhoneForFirebase(phoneNumber, countryCode);

        // Check if user already exists and is a member
        const existingUser = await findUserByPhone(formattedPhone);
        if (existingUser) {
          // User exists, try to add them directly
          try {
            await addMember(user!.id, existingUser.id, existingUser.displayName);
            showAlert('Success', `${existingUser.displayName} has been added to the community.`);
            setShowInviteModal(false);
            setPhoneNumber('');
            loadData();
            return;
          } catch (error: any) {
            if (error.message?.includes('already a member')) {
              showAlert('Already a Member', 'This user is already a member of the community.');
              return;
            }
          }
        }

        // Create invite for new user
        const invite = await createInvite(
          formattedPhone,
          user!.id,
          user!.displayName
        );

        setLastInvite(invite);
        loadData();
        setShowInviteModal(false);
        setPhoneNumber('');

        // Automatically open share sheet
        await handleShareInvite(invite);

      } catch (error: any) {
        console.error('Error inviting member:', error);
        showAlert('Error', error.message || 'Failed to create invite');
      } finally {
        setIsInviting(false);
      }
    } else {
      // Email invite
      const emailValidation = validateEmail(inviteEmail);
      if (!emailValidation.valid) {
        showAlert('Invalid Email', emailValidation.error || 'Please enter a valid email address.');
        return;
      }

      setIsInviting(true);
      try {
        // Create email invite
        const invite = await createEmailInvite(
          inviteEmail.toLowerCase(),
          user!.id,
          user!.displayName
        );

        setLastInvite(invite);
        loadData();
        setShowInviteModal(false);
        setInviteEmail('');

        // Automatically open share sheet
        await handleShareInvite(invite);

      } catch (error: any) {
        console.error('Error inviting member:', error);
        showAlert('Error', error.message || 'Failed to create invite');
      } finally {
        setIsInviting(false);
      }
    }
  };

  const handleCancelInvite = async (invite: Invite) => {
    const inviteTarget = invite.inviteType === 'email' ? invite.email : invite.phoneNumber;
    const confirmed = showConfirm(`Cancel invite for ${inviteTarget}?`);
    if (!confirmed) return;

    try {
      await cancelInvite(invite.id);
      loadData();
      showAlert('Cancelled', 'Invite has been cancelled.');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to cancel invite');
    }
  };

  const handleCopyInvite = (invite: Invite) => {
    const message = invite.inviteType === 'email'
      ? generateEmailInviteMessage(user!.displayName, invite.inviteCode)
      : generateInviteMessage(user!.displayName, invite.inviteCode);
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(message);
      const deliveryMethod = invite.inviteType === 'email' ? 'email' : 'SMS or messaging app';
      showAlert('Copied!', `Invite message copied to clipboard. Send it to the invitee via ${deliveryMethod}.`);
    }
  };

  const handleShareInvite = async (invite: Invite) => {
    const message = invite.inviteType === 'email'
      ? generateEmailInviteMessage(user!.displayName, invite.inviteCode)
      : generateInviteMessage(user!.displayName, invite.inviteCode);
    const link = generateInviteLink(invite.inviteCode);

    try {
      if (Platform.OS === 'web') {
        // Web Share API (works on mobile browsers and some desktop browsers)
        if (navigator.share) {
          await navigator.share({
            title: 'Join Northstar Community',
            text: message,
            url: link,
          });
        } else {
          // Fallback to clipboard
          navigator.clipboard.writeText(message);
          showAlert('Copied!', 'Invite message copied to clipboard.');
        }
      } else {
        // Native Share for iOS/Android
        await Share.share({
          message: message,
          title: 'Join Northstar Community',
        });
      }
    } catch (error: any) {
      // User cancelled share or error occurred
      if (error.name !== 'AbortError') {
        console.error('Error sharing:', error);
      }
    }
  };

  const handleRemoveMember = (member: User) => {
    if (member.role === 'admin') {
      showAlert('Cannot Remove', 'Cannot remove the admin from the community.');
      return;
    }

    const confirmed = showConfirm(`Remove ${member.displayName} from the community?`);
    if (!confirmed) return;

    removeMember(user!.id, member.id)
      .then(() => {
        loadData();
        showAlert('Removed', `${member.displayName} has been removed.`);
      })
      .catch((error: any) => {
        showAlert('Error', error.message || 'Failed to remove member');
      });
  };

  const handlePromoteMember = (member: User) => {
    const confirmed = showConfirm(`Promote ${member.displayName} to admin?`);
    if (!confirmed) return;

    promoteToAdmin(user!.id, member.id)
      .then(() => {
        loadData();
        showAlert('Promoted', `${member.displayName} is now an admin.`);
      })
      .catch((error: any) => {
        showAlert('Error', error.message || 'Failed to promote member');
      });
  };

  const handleDemoteMember = (member: User) => {
    if (ownerId && member.id === ownerId) {
      showAlert('Cannot Demote', 'Cannot demote the community owner.');
      return;
    }

    const confirmed = showConfirm(`Remove admin role from ${member.displayName}?`);
    if (!confirmed) return;

    demoteFromAdmin(user!.id, member.id)
      .then(() => {
        loadData();
        showAlert('Demoted', `${member.displayName} is no longer an admin.`);
      })
      .catch((error: any) => {
        showAlert('Error', error.message || 'Failed to demote member');
      });
  };

  // Chat control handlers - now room-specific
  const handleToggleChatLock = async () => {
    setIsTogglingLock(true);
    try {
      await setRoomChatLock(user!.id, selectedRoomId, !chatLocked);
      await loadRoomSettings(selectedRoomId);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to toggle chat lock');
    } finally {
      setIsTogglingLock(false);
    }
  };

  const handleToggleSpeaker = async (member: User) => {
    const isCurrentlySpeaker = allowedSpeakers.includes(member.id);
    try {
      if (isCurrentlySpeaker) {
        await removeRoomAllowedSpeaker(user!.id, selectedRoomId, member.id, member.displayName);
      } else {
        await addRoomAllowedSpeaker(user!.id, selectedRoomId, member.id, member.displayName);
      }
      await loadRoomSettings(selectedRoomId);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to update speaker permissions');
    }
  };

  // Maintenance handler - fix encoded apostrophes in existing messages
  const handleFixApostrophes = async () => {
    const confirmed = showConfirm('This will fix HTML-encoded apostrophes (&#x27;) in all existing messages. Continue?');
    if (!confirmed) return;

    setIsFixingApostrophes(true);
    setFixResult(null);
    try {
      const result = await callFunction<{ success: boolean; totalFixed: number; message: string }>('fixEncodedApostrophes', {});
      setFixResult(`${result.message}`);
      showAlert('Success', result.message);
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to fix apostrophes';
      setFixResult(`Error: ${errorMsg}`);
      showAlert('Error', errorMsg);
    } finally {
      setIsFixingApostrophes(false);
    }
  };

  // Maintenance handler - delete test system messages
  const handleDeleteTestMessages = async () => {
    const confirmed = showConfirm('Delete system messages containing "TEST"? This cannot be undone.');
    if (!confirmed) return;

    setIsDeletingTestMessages(true);
    setFixResult(null);
    try {
      const result = await callFunction<{ success: boolean; totalDeleted: number; message: string }>('deleteSystemMessages', {
        contentPatterns: ['TEST has joined', 'TEST has been removed']
      });
      setFixResult(`${result.message}`);
      showAlert('Success', result.message);
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to delete messages';
      setFixResult(`Error: ${errorMsg}`);
      showAlert('Error', errorMsg);
    } finally {
      setIsDeletingTestMessages(false);
    }
  };

  // Get allowed speakers as User objects
  const allowedSpeakerUsers = members.filter(m => allowedSpeakers.includes(m.id));

  // Get Northstar Coaching members — anyone with Core access (standard tier
  // OR all-access tier, since all-access includes Core). Admins are excluded
  // here because they have access by role and can't be revoked through this UI.
  const standardMembers = members.filter(
    m =>
      (m.subscriptionTier === 'standard' || m.subscriptionTier === 'all-access') &&
      m.role !== 'admin'
  );
  // No-access = no Core tier, no Elite, not admin
  const noAccessMembers = members.filter(
    m =>
      (m.subscriptionTier === 'none' || !m.subscriptionTier) &&
      m.hasEliteAccess !== true &&
      m.role !== 'admin'
  );

  // Get Elite members
  const eliteMembers = members.filter(m => m.hasEliteAccess === true);
  const nonEliteMembers = members.filter(m => m.hasEliteAccess !== true && m.role !== 'admin');

  // Northstar Coaching access handler — grants standard access if user has none,
  // revokes if they already have access (whether standard or all-access).
  const handleToggleStandardAccess = async (member: User) => {
    setTogglingStandardUserId(member.id);
    try {
      const hasCoreAccess =
        member.subscriptionTier === 'standard' ||
        member.subscriptionTier === 'all-access';
      if (hasCoreAccess) {
        const isAllAccess = member.subscriptionTier === 'all-access';
        const message = isAllAccess
          ? `${member.displayName} currently has ALL-ACCESS (Core + Elite).\n\n` +
            `Revoking Northstar Coaching access will also remove their Inner Circle access.\n\n` +
            `Continue?`
          : `Revoke Northstar Coaching access from ${member.displayName}?`;
        const confirmed = showConfirm(message);
        if (!confirmed) {
          setTogglingStandardUserId(null);
          return;
        }
        await revokeStandardAccess(user!.id, member.id);
        showAlert(
          'Access Revoked',
          `${member.displayName} no longer has Northstar Coaching access${isAllAccess ? ' or Elite access' : ''}.`
        );
      } else {
        await grantStandardAccess(user!.id, member.id);
        showAlert('Access Granted', `${member.displayName} now has Northstar Coaching access!`);
      }
      loadData();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to update Standard access');
    } finally {
      setTogglingStandardUserId(null);
    }
  };

  // Elite access handler
  const handleToggleEliteAccess = async (member: User) => {
    setTogglingEliteUserId(member.id);
    try {
      if (member.hasEliteAccess) {
        const confirmed = showConfirm(`Revoke Elite access from ${member.displayName}?`);
        if (!confirmed) {
          setTogglingEliteUserId(null);
          return;
        }
        await revokeEliteAccess(user!.id, member.id);
        showAlert('Access Revoked', `${member.displayName} no longer has Elite access.`);
      } else {
        await grantEliteAccess(user!.id, member.id);
        showAlert('Access Granted', `${member.displayName} now has Inner Circle access!`);
      }
      // Reload members to get updated data
      loadData();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to update Elite access');
    } finally {
      setTogglingEliteUserId(null);
    }
  };

  const renderChatControl = () => (
    <ScrollView style={styles.chatControlContainer}>
      {/* Room Selector */}
      <View style={styles.chatControlSection}>
        <Text style={styles.sectionTitle}>Select Chat Room</Text>
        <Text style={styles.sectionDescription}>
          Each room has its own chat lock settings. Select which room to manage.
        </Text>
        <View style={styles.roomSelector}>
          {(Object.keys(CHAT_ROOMS) as ChatRoomId[]).map((roomId) => {
            const room = CHAT_ROOMS[roomId];
            const isSelected = selectedRoomId === roomId;
            return (
              <TouchableOpacity
                key={roomId}
                style={[styles.roomSelectorItem, isSelected && styles.roomSelectorItemActive]}
                onPress={() => setSelectedRoomId(roomId)}
              >
                <Text style={styles.roomSelectorIcon}>{room.icon}</Text>
                <Text style={[styles.roomSelectorText, isSelected && styles.roomSelectorTextActive]}>
                  {room.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Chat Lock Toggle */}
      <View style={styles.chatControlSection}>
        <Text style={styles.sectionTitle}>Chat Lock - {CHAT_ROOMS[selectedRoomId].name}</Text>
        <Text style={styles.sectionDescription}>
          When enabled, only you and selected speakers can send messages in this room.
        </Text>
        <TouchableOpacity
          style={[styles.lockToggle, chatLocked && styles.lockToggleActive]}
          onPress={handleToggleChatLock}
          disabled={isTogglingLock}
        >
          <View style={styles.lockToggleContent}>
            <View style={[styles.lockIcon, chatLocked && styles.lockIconActive]}>
              <Text style={styles.lockIconText}>{chatLocked ? '🔒' : '🔓'}</Text>
            </View>
            <View style={styles.lockToggleText}>
              <Text style={[styles.lockToggleTitle, chatLocked && styles.lockToggleTitleActive]}>
                {chatLocked ? 'Chat is Locked' : 'Chat is Open'}
              </Text>
              <Text style={styles.lockToggleSubtitle}>
                {chatLocked ? 'Only admin and allowed speakers can message' : 'Everyone can send messages'}
              </Text>
            </View>
          </View>
          <View style={[styles.toggleSwitch, chatLocked && styles.toggleSwitchActive]}>
            <View style={[styles.toggleKnob, chatLocked && styles.toggleKnobActive]} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Allowed Speakers Section - Only show when chat is locked */}
      {chatLocked && (
        <View style={styles.chatControlSection}>
          <Text style={styles.sectionTitle}>Allowed Speakers ({allowedSpeakerUsers.length})</Text>
          <Text style={styles.sectionDescription}>
            Select members who can send messages when chat is locked.
          </Text>

          {/* Current Speakers */}
          {allowedSpeakerUsers.length > 0 && (
            <View style={styles.speakersList}>
              <Text style={styles.speakersSubheading}>Currently Allowed:</Text>
              {allowedSpeakerUsers.map(speaker => (
                <View key={speaker.id} style={styles.speakerItem}>
                  <View style={styles.speakerInfo}>
                    <View style={styles.speakerAvatar}>
                      <Text style={styles.speakerAvatarText}>
                        {speaker.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.speakerName}>{speaker.displayName}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeSpeakerButton}
                    onPress={() => handleToggleSpeaker(speaker)}
                  >
                    <Text style={styles.removeSpeakerText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Add Speakers - Show members not yet allowed */}
          <View style={styles.addSpeakersSection}>
            <Text style={styles.speakersSubheading}>Add Speaker:</Text>
            {members
              .filter(m => m.role !== 'admin' && !allowedSpeakers.includes(m.id))
              .map(member => (
                <TouchableOpacity
                  key={member.id}
                  style={styles.addSpeakerItem}
                  onPress={() => handleToggleSpeaker(member)}
                >
                  <View style={styles.speakerInfo}>
                    <View style={[styles.speakerAvatar, styles.speakerAvatarInactive]}>
                      <Text style={styles.speakerAvatarText}>
                        {member.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.speakerName}>{member.displayName}</Text>
                  </View>
                  <View style={styles.addSpeakerButton}>
                    <Text style={styles.addSpeakerText}>+ Add</Text>
                  </View>
                </TouchableOpacity>
              ))}
            {members.filter(m => m.role !== 'admin' && !allowedSpeakers.includes(m.id)).length === 0 && (
              <Text style={styles.noMembersText}>All members are already allowed speakers</Text>
            )}
          </View>
        </View>
      )}

      {/* Maintenance Section */}
      <View style={styles.chatControlSection}>
        <Text style={styles.sectionTitle}>Maintenance</Text>
        <Text style={styles.sectionDescription}>
          Administrative tools for fixing data issues.
        </Text>

        <TouchableOpacity
          style={[styles.maintenanceButton, isFixingApostrophes && styles.maintenanceButtonDisabled]}
          onPress={handleFixApostrophes}
          disabled={isFixingApostrophes}
        >
          <View style={styles.maintenanceButtonContent}>
            <Text style={styles.maintenanceButtonIcon}>🔧</Text>
            <View style={styles.maintenanceButtonText}>
              <Text style={styles.maintenanceButtonTitle}>
                {isFixingApostrophes ? 'Fixing...' : 'Fix Encoded Apostrophes'}
              </Text>
              <Text style={styles.maintenanceButtonSubtitle}>
                Replace &#x27; with ' in all messages
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.maintenanceButton, { marginTop: SPACING.sm }, isDeletingTestMessages && styles.maintenanceButtonDisabled]}
          onPress={handleDeleteTestMessages}
          disabled={isDeletingTestMessages}
        >
          <View style={styles.maintenanceButtonContent}>
            <Text style={styles.maintenanceButtonIcon}>🗑️</Text>
            <View style={styles.maintenanceButtonText}>
              <Text style={styles.maintenanceButtonTitle}>
                {isDeletingTestMessages ? 'Deleting...' : 'Delete Test Messages'}
              </Text>
              <Text style={styles.maintenanceButtonSubtitle}>
                Remove TEST joined/removed system messages
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {fixResult && (
          <View style={[styles.fixResultBanner, fixResult.startsWith('Error') && styles.fixResultBannerError]}>
            <Text style={styles.fixResultText}>{fixResult}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderEliteAccess = () => (
    <ScrollView style={styles.chatControlContainer}>
      {/* Standard Access Header */}
      <View style={styles.chatControlSection}>
        <View style={styles.eliteHeader}>
          <Text style={styles.eliteIcon}>✨</Text>
          <Text style={styles.sectionTitle}>Northstar Coaching</Text>
        </View>
        <Text style={styles.sectionDescription}>
          Grant or revoke access to the Northstar Coaching chat room.
        </Text>
        <View style={styles.eliteStats}>
          <View style={styles.eliteStat}>
            <Text style={styles.eliteStatNumber}>{standardMembers.length}</Text>
            <Text style={styles.eliteStatLabel}>With Access</Text>
          </View>
          <View style={styles.eliteStat}>
            <Text style={styles.eliteStatNumber}>{noAccessMembers.length}</Text>
            <Text style={styles.eliteStatLabel}>No Access</Text>
          </View>
        </View>
      </View>

      {/* Current Northstar Coaching Members (Standard + All-Access subscribers) */}
      <View style={styles.chatControlSection}>
        <Text style={styles.sectionTitle}>Members With Access ({standardMembers.length})</Text>
        {standardMembers.length === 0 ? (
          <Text style={styles.noMembersText}>No members have Northstar Coaching access yet</Text>
        ) : (
          standardMembers.map(member => {
            const isAllAccess = member.subscriptionTier === 'all-access';
            return (
            <View key={member.id} style={styles.standardMemberItem}>
              <View style={styles.speakerInfo}>
                <View style={[styles.speakerAvatar, styles.standardAvatar]}>
                  <Text style={styles.speakerAvatarText}>
                    {member.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.speakerName}>{member.displayName}</Text>
                  <Text style={styles.standardBadgeText}>
                    {isAllAccess ? 'All-Access (Core + Elite)' : 'Standard (Core only)'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.removeSpeakerButton}
                onPress={() => handleToggleStandardAccess(member)}
                disabled={togglingStandardUserId === member.id}
              >
                <Text style={styles.removeSpeakerText}>
                  {togglingStandardUserId === member.id ? 'Updating...' : 'Revoke'}
                </Text>
              </TouchableOpacity>
            </View>
            );
          })
        )}
      </View>

      {/* Grant Standard Access */}
      <View style={styles.chatControlSection}>
        <Text style={styles.sectionTitle}>Grant Standard Access</Text>
        <Text style={styles.sectionDescription}>
          Select members to grant Northstar Coaching access.
        </Text>
        {noAccessMembers.length === 0 ? (
          <Text style={styles.noMembersText}>All members already have access</Text>
        ) : (
          noAccessMembers.map(member => (
            <TouchableOpacity
              key={member.id}
              style={styles.addSpeakerItem}
              onPress={() => handleToggleStandardAccess(member)}
              disabled={togglingStandardUserId === member.id}
            >
              <View style={styles.speakerInfo}>
                <View style={[styles.speakerAvatar, styles.speakerAvatarInactive]}>
                  <Text style={styles.speakerAvatarText}>
                    {member.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.speakerName}>{member.displayName}</Text>
              </View>
              <View style={styles.grantStandardButton}>
                <Text style={styles.grantStandardText}>
                  {togglingStandardUserId === member.id ? '...' : '+ Grant'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Elite Access Header */}
      <View style={styles.chatControlSection}>
        <View style={styles.eliteHeader}>
          <Text style={styles.eliteIcon}>👁️</Text>
          <Text style={styles.sectionTitle}>Inner Circle</Text>
        </View>
        <Text style={styles.sectionDescription}>
          Grant or revoke access to the exclusive Inner Circle chat room.
          Members with Elite access can view and send messages in the Elite room.
        </Text>
        <View style={styles.eliteStats}>
          <View style={styles.eliteStat}>
            <Text style={styles.eliteStatNumber}>{eliteMembers.length}</Text>
            <Text style={styles.eliteStatLabel}>Elite Members</Text>
          </View>
          <View style={styles.eliteStat}>
            <Text style={styles.eliteStatNumber}>{nonEliteMembers.length}</Text>
            <Text style={styles.eliteStatLabel}>Standard Members</Text>
          </View>
        </View>
      </View>

      {/* Current Elite Members */}
      <View style={styles.chatControlSection}>
        <Text style={styles.sectionTitle}>Elite Members ({eliteMembers.length})</Text>
        {eliteMembers.length === 0 ? (
          <Text style={styles.noMembersText}>No members have Elite access yet</Text>
        ) : (
          eliteMembers.map(member => (
            <View key={member.id} style={styles.eliteMemberItem}>
              <View style={styles.speakerInfo}>
                <View style={[styles.speakerAvatar, styles.eliteAvatar]}>
                  <Text style={styles.speakerAvatarText}>
                    {member.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.speakerName}>{member.displayName}</Text>
                  <Text style={styles.eliteBadgeText}>Elite Member</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.removeSpeakerButton}
                onPress={() => handleToggleEliteAccess(member)}
                disabled={togglingEliteUserId === member.id}
              >
                <Text style={styles.removeSpeakerText}>
                  {togglingEliteUserId === member.id ? 'Updating...' : 'Revoke'}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Add Elite Members */}
      <View style={styles.chatControlSection}>
        <Text style={styles.sectionTitle}>Grant Elite Access</Text>
        <Text style={styles.sectionDescription}>
          Select members to grant Inner Circle access.
        </Text>
        {nonEliteMembers.length === 0 ? (
          <Text style={styles.noMembersText}>All members already have Elite access</Text>
        ) : (
          nonEliteMembers.map(member => (
            <TouchableOpacity
              key={member.id}
              style={styles.addSpeakerItem}
              onPress={() => handleToggleEliteAccess(member)}
              disabled={togglingEliteUserId === member.id}
            >
              <View style={styles.speakerInfo}>
                <View style={[styles.speakerAvatar, styles.speakerAvatarInactive]}>
                  <Text style={styles.speakerAvatarText}>
                    {member.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.speakerName}>{member.displayName}</Text>
              </View>
              <View style={styles.grantEliteButton}>
                <Text style={styles.grantEliteText}>
                  {togglingEliteUserId === member.id ? '...' : '+ Grant'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );

  const growthLabInvitedMembers = members.filter(m => growthLabInvitedIds.includes(m.id));
  const growthLabAvailableMembers = members.filter(
    m => !growthLabInvitedIds.includes(m.id) && m.role !== 'admin'
  );

  const renderGrowthLabInvites = () => {
    if (!isGrowthLabRoomActive()) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Growth Lab is not active</Text>
          <Text style={styles.emptySubtitle}>
            This room is only available May 1 – September 30, 2026.
          </Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.chatControlContainer}>
        <View style={styles.chatControlSection}>
          <View style={styles.eliteHeader}>
            <Text style={styles.eliteIcon}>👑</Text>
            <Text style={styles.sectionTitle}>Growth Lab</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Invite-only, open forum. Active through September 30, 2026.
            Anyone you add can read and post in the room.
          </Text>
          <View style={styles.eliteStats}>
            <View style={styles.eliteStat}>
              <Text style={styles.eliteStatNumber}>{growthLabInvitedMembers.length}</Text>
              <Text style={styles.eliteStatLabel}>Has Access</Text>
            </View>
            <View style={styles.eliteStat}>
              <Text style={styles.eliteStatNumber}>{growthLabAvailableMembers.length}</Text>
              <Text style={styles.eliteStatLabel}>No Access</Text>
            </View>
          </View>
        </View>

        <View style={styles.chatControlSection}>
          <Text style={styles.sectionTitle}>Members With Access ({growthLabInvitedMembers.length})</Text>
          {growthLabInvitedMembers.length === 0 ? (
            <Text style={styles.noMembersText}>No one has access yet — add members below</Text>
          ) : (
            growthLabInvitedMembers.map(member => (
              <View key={member.id} style={styles.eliteMemberItem}>
                <View style={styles.speakerInfo}>
                  <View style={[styles.speakerAvatar, styles.eliteAvatar]}>
                    <Text style={styles.speakerAvatarText}>
                      {member.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.speakerName}>{member.displayName}</Text>
                    <Text style={styles.eliteBadgeText}>Growth Lab</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.removeSpeakerButton}
                  onPress={() => handleToggleGrowthLabInvite(member)}
                  disabled={togglingGrowthLabUserId === member.id}
                >
                  <Text style={styles.removeSpeakerText}>
                    {togglingGrowthLabUserId === member.id ? 'Updating...' : 'Remove'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={styles.chatControlSection}>
          <Text style={styles.sectionTitle}>Diagnostic: Why Are Members Locked Out?</Text>
          <Text style={styles.sectionDescription}>
            Inspects the invite list. Users not in the community ("ghost"
            entries) can be re-added below.
          </Text>
          <TouchableOpacity
            style={styles.maintenanceButton}
            onPress={handleRunGrowthLabDiagnostic}
          >
            <View style={styles.maintenanceButtonContent}>
              <Text style={styles.maintenanceButtonIcon}>🩺</Text>
              <View style={styles.maintenanceButtonText}>
                <Text style={styles.maintenanceButtonTitle}>Run Diagnostic</Text>
                <Text style={styles.maintenanceButtonSubtitle}>
                  Show invite list + subscription state for each user
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {growthLabDiagnostic && (
            <View style={{ marginTop: SPACING.md }}>
              <Text style={[styles.maintenanceButtonSubtitle, { marginBottom: SPACING.sm }]}>
                {growthLabDiagnostic.invitedCount} invited · {growthLabDiagnostic.communityMemberCount} community members
              </Text>
              {growthLabDiagnostic.invitedUsers.map((u) => {
                const ghost = !u.isCommunityMember;
                const sub = u.subscriptionTier
                  ? `${u.subscriptionTier}/${u.subscriptionStatus || '?'}`
                  : 'no sub';
                return (
                  <View key={u.uid} style={styles.eliteMemberItem}>
                    <View style={[styles.speakerInfo, { flex: 1 }]}>
                      <View>
                        <Text style={styles.speakerName} numberOfLines={1}>
                          {ghost ? '⚠️ ' : '✓ '}{u.displayName || '(no name)'}
                        </Text>
                        <Text style={[styles.maintenanceButtonSubtitle, { marginTop: 2 }]} numberOfLines={1}>
                          {ghost ? 'NOT in community · ' : 'in community · '}{sub}
                          {u.hasEliteAccess ? ' · elite' : ''}
                          {u.role === 'admin' ? ' · admin' : ''}
                        </Text>
                      </View>
                    </View>
                    {ghost && (
                      <TouchableOpacity
                        style={styles.removeSpeakerButton}
                        onPress={() => handleRepairCommunityMember(u.uid, u.displayName)}
                        disabled={repairingUid === u.uid}
                      >
                        <Text style={styles.removeSpeakerText}>
                          {repairingUid === u.uid ? 'Adding...' : 'Re-add to Community'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.chatControlSection}>
          <Text style={styles.sectionTitle}>Cleanup: Misrouted Messages</Text>
          <Text style={styles.sectionDescription}>
            Scan for messages that were posted in Growth Lab but landed in
            Northstar Coaching due to a routing bug. Move them to the correct room.
          </Text>
          <TouchableOpacity
            style={[styles.maintenanceButton, isLoadingMisrouted && styles.maintenanceButtonDisabled]}
            onPress={handleScanMisroutedMessages}
            disabled={isLoadingMisrouted}
          >
            <View style={styles.maintenanceButtonContent}>
              <Text style={styles.maintenanceButtonIcon}>🔍</Text>
              <View style={styles.maintenanceButtonText}>
                <Text style={styles.maintenanceButtonTitle}>
                  {isLoadingMisrouted ? 'Scanning...' : 'Scan Last 7 Days'}
                </Text>
                <Text style={styles.maintenanceButtonSubtitle}>
                  Find messages from Growth Lab invitees that were misrouted
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <View style={{ marginTop: SPACING.sm }}>
            <Text style={[styles.maintenanceButtonSubtitle, { marginBottom: 6 }]}>
              Or search by a phrase from the message (catches admin posts too):
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 8,
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.sm,
                backgroundColor: COLORS.surface,
                color: COLORS.text,
              }}
              placeholder='e.g. "GROWTH LAB"'
              placeholderTextColor={COLORS.textLight}
              value={contentSearchQuery}
              onChangeText={setContentSearchQuery}
              onSubmitEditing={handleSearchByContent}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={[
                styles.maintenanceButton,
                { marginTop: SPACING.sm },
                isSearchingContent && styles.maintenanceButtonDisabled,
              ]}
              onPress={handleSearchByContent}
              disabled={isSearchingContent}
            >
              <View style={styles.maintenanceButtonContent}>
                <Text style={styles.maintenanceButtonIcon}>🔎</Text>
                <View style={styles.maintenanceButtonText}>
                  <Text style={styles.maintenanceButtonTitle}>
                    {isSearchingContent ? 'Searching...' : 'Search Core Messages'}
                  </Text>
                  <Text style={styles.maintenanceButtonSubtitle}>
                    Find any message in Northstar Coaching containing this text
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {misroutedCandidates.length > 0 && (
            <View style={{ marginTop: SPACING.md }}>
              {misroutedCandidates.map((c) => {
                const ts = c.timestamp ? new Date(c.timestamp) : null;
                const tsLabel = ts ? ts.toLocaleString() : '';
                const previewMain =
                  c.type === 'voice'
                    ? '🎤 Voice note'
                    : c.type === 'image'
                    ? '🖼️ Image'
                    : c.type === 'video'
                    ? '🎬 Video'
                    : c.content || '(empty)';
                return (
                  <View key={c.id} style={styles.eliteMemberItem}>
                    <View style={[styles.speakerInfo, { flex: 1 }]}>
                      <View>
                        <Text style={styles.speakerName} numberOfLines={1}>
                          {c.senderName}
                        </Text>
                        <Text style={[styles.maintenanceButtonSubtitle, { marginTop: 2 }]} numberOfLines={2}>
                          {previewMain}
                        </Text>
                        <Text style={[styles.maintenanceButtonSubtitle, { marginTop: 2, opacity: 0.7 }]}>
                          {tsLabel}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.removeSpeakerButton}
                      onPress={() => handleMigrateMessage(c.id)}
                      disabled={migratingMessageId === c.id}
                    >
                      <Text style={styles.removeSpeakerText}>
                        {migratingMessageId === c.id ? 'Moving...' : 'Move'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.chatControlSection}>
          <Text style={styles.sectionTitle}>Add Members</Text>
          <Text style={styles.sectionDescription}>
            Tap a member to add them to Growth Lab. They get access immediately.
          </Text>
          {growthLabAvailableMembers.length === 0 ? (
            <Text style={styles.noMembersText}>All eligible members already have access</Text>
          ) : (
            growthLabAvailableMembers.map(member => (
              <TouchableOpacity
                key={member.id}
                style={styles.addSpeakerItem}
                onPress={() => handleToggleGrowthLabInvite(member)}
                disabled={togglingGrowthLabUserId === member.id}
              >
                <View style={styles.speakerInfo}>
                  <View style={[styles.speakerAvatar, styles.speakerAvatarInactive]}>
                    <Text style={styles.speakerAvatarText}>
                      {member.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.speakerName}>{member.displayName}</Text>
                </View>
                <View style={styles.grantEliteButton}>
                  <Text style={styles.grantEliteText}>
                    {togglingGrowthLabUserId === member.id ? '...' : '+ Add'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    );
  };

  const renderInvitesList = () => (
    <ScrollView style={styles.invitesList}>
      {pendingInvites.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No pending invites</Text>
          <Text style={styles.emptySubtitle}>
            Invite someone to join the community
          </Text>
        </View>
      ) : (
        pendingInvites.map((invite) => (
          <View key={invite.id} style={styles.inviteCard}>
            <View style={styles.inviteInfo}>
              <View style={styles.inviteContactRow}>
                <Text style={styles.inviteTypeLabel}>
                  {invite.inviteType === 'email' ? '📧' : '📱'}
                </Text>
                <Text style={styles.invitePhone}>
                  {invite.inviteType === 'email' ? invite.email : invite.phoneNumber}
                </Text>
              </View>
              <Text style={styles.inviteCode}>Code: {invite.inviteCode}</Text>
              <Text style={styles.inviteExpiry}>
                Expires: {toDate(invite.expiresAt)?.toLocaleDateString() || 'Unknown'}
              </Text>
            </View>
            <View style={styles.inviteActions}>
              <TouchableOpacity
                style={styles.shareButton}
                onPress={() => handleShareInvite(invite)}
              >
                <Text style={styles.shareButtonText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={() => handleCopyInvite(invite)}
              >
                <Text style={styles.copyButtonText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => handleCancelInvite(invite)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );

  // Show loading while auth is loading or data is loading
  if (authLoading || isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner fullScreen message="Loading..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Page Header with Back Button */}
      <View style={styles.pageHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(main)/chat');
            }
          }}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          activeOpacity={0.6}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Manage Members</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tab Header */}
      <View style={styles.tabHeader}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'members' && styles.activeTab]}
          onPress={() => setActiveTab('members')}
        >
          <Text style={[styles.tabText, activeTab === 'members' && styles.activeTabText]}>
            Members ({members.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'invites' && styles.activeTab]}
          onPress={() => setActiveTab('invites')}
        >
          <Text style={[styles.tabText, activeTab === 'invites' && styles.activeTabText]}>
            Invites ({pendingInvites.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chatControl' && styles.activeTab]}
          onPress={() => setActiveTab('chatControl')}
        >
          <Text style={[styles.tabText, activeTab === 'chatControl' && styles.activeTabText]}>
            Chat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'eliteAccess' && styles.activeTab]}
          onPress={() => setActiveTab('eliteAccess')}
        >
          <Text style={[styles.tabText, activeTab === 'eliteAccess' && styles.activeTabText]}>
            Access
          </Text>
        </TouchableOpacity>
        {isGrowthLabRoomActive() && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'growthLab' && styles.activeTab]}
            onPress={() => setActiveTab('growthLab')}
          >
            <Text style={[styles.tabText, activeTab === 'growthLab' && styles.activeTabText]}>
              👑 Growth Lab
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.header}>
        <Button
          title="Invite New Member"
          onPress={() => setShowInviteModal(true)}
          style={styles.inviteButton}
        />
        <Button
          title="📚 Library (Prompts, Links)"
          onPress={() => router.push('/(admin)/menu')}
          variant="outline"
          style={[styles.inviteButton, { marginTop: SPACING.sm }]}
        />
      </View>

      {/* Content */}
      {activeTab === 'members' && (
        <MemberList
          members={members}
          isLoading={false}
          showRemoveButton={true}
          onRemoveMember={handleRemoveMember}
          ownerId={ownerId || undefined}
          isCurrentUserAdmin={isAdmin}
          onPromoteMember={handlePromoteMember}
          onDemoteMember={handleDemoteMember}
        />
      )}
      {activeTab === 'invites' && renderInvitesList()}
      {activeTab === 'chatControl' && renderChatControl()}
      {activeTab === 'eliteAccess' && renderEliteAccess()}
      {activeTab === 'growthLab' && renderGrowthLabInvites()}

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Invite New Member</Text>
            <Text style={styles.modalSubtitle}>
              {inviteMethod === 'phone'
                ? "Enter their phone number to send an invite. They'll receive a code to join."
                : "Enter their email address to send an invite. They'll receive a code to join."}
            </Text>

            {/* Phone/Email Toggle */}
            <View style={styles.inviteMethodToggle}>
              <TouchableOpacity
                style={[styles.inviteMethodButton, inviteMethod === 'phone' && styles.inviteMethodButtonActive]}
                onPress={() => setInviteMethod('phone')}
              >
                <Text style={[styles.inviteMethodText, inviteMethod === 'phone' && styles.inviteMethodTextActive]}>
                  📱 Phone
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inviteMethodButton, inviteMethod === 'email' && styles.inviteMethodButtonActive]}
                onPress={() => setInviteMethod('email')}
              >
                <Text style={[styles.inviteMethodText, inviteMethod === 'email' && styles.inviteMethodTextActive]}>
                  📧 Email
                </Text>
              </TouchableOpacity>
            </View>

            {inviteMethod === 'phone' ? (
              <View style={styles.phoneInputContainer}>
                <TextInput
                  style={styles.countryCodeInput}
                  value={countryCode}
                  onChangeText={setCountryCode}
                  keyboardType="phone-pad"
                  maxLength={4}
                />
                <TextInput
                  style={styles.phoneInput}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={COLORS.textLight}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              </View>
            ) : (
              <TextInput
                style={styles.emailInput}
                placeholder="email@example.com"
                placeholderTextColor={COLORS.textLight}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            )}

            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                onPress={() => {
                  setShowInviteModal(false);
                  setPhoneNumber('');
                  setInviteEmail('');
                }}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Send Invite"
                onPress={handleInviteMember}
                loading={isInviting}
                disabled={inviteMethod === 'phone' ? !phoneNumber.trim() : !inviteEmail.trim()}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -SPACING.sm,
  },
  backArrow: {
    fontSize: 28,
    color: '#fff',
    fontWeight: 'bold',
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  headerSpacer: {
    width: 40,
  },
  tabHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: COLORS.primary,
  },
  header: {
    padding: SPACING.md,
    backgroundColor: COLORS.background,
  },
  inviteButton: {
    height: 50,
  },
  invitesList: {
    flex: 1,
  },
  emptyState: {
    padding: SPACING.xl * 2,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  inviteCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  inviteInfo: {
    flex: 1,
  },
  invitePhone: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  inviteCode: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
    marginTop: 2,
  },
  inviteExpiry: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  shareButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  shareButtonText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '500',
  },
  copyButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.border,
    borderRadius: 8,
  },
  copyButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
  },
  cancelButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  cancelButtonText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
  },
  countryCodeInput: {
    width: 60,
    height: 56,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    fontSize: 16,
    color: COLORS.text,
    marginRight: SPACING.sm,
    textAlign: 'center',
  },
  phoneInput: {
    flex: 1,
    height: 56,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  modalButton: {
    flex: 1,
    height: 50,
  },
  inviteMethodToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 4,
    marginBottom: SPACING.lg,
  },
  inviteMethodButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: 10,
  },
  inviteMethodButtonActive: {
    backgroundColor: COLORS.primary,
  },
  inviteMethodText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  inviteMethodTextActive: {
    color: '#fff',
  },
  emailInput: {
    height: 56,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  inviteContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteTypeLabel: {
    fontSize: 16,
    marginRight: SPACING.xs,
  },
  // Chat Control styles
  chatControlContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  chatControlSection: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  sectionDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  lockToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lockToggleActive: {
    backgroundColor: 'rgba(254, 42, 148, 0.1)',
    borderColor: COLORS.primary,
  },
  lockToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  lockIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  lockIconActive: {
    backgroundColor: COLORS.primary,
  },
  lockIconText: {
    fontSize: 20,
  },
  lockToggleText: {
    flex: 1,
  },
  lockToggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  lockToggleTitleActive: {
    color: COLORS.primary,
  },
  lockToggleSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: COLORS.primary,
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  speakersList: {
    marginBottom: SPACING.md,
  },
  speakersSubheading: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  speakerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    marginBottom: SPACING.xs,
  },
  speakerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  speakerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  speakerAvatarInactive: {
    backgroundColor: COLORS.border,
  },
  speakerAvatarText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  speakerName: {
    fontSize: 15,
    color: COLORS.text,
  },
  removeSpeakerButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  removeSpeakerText: {
    color: COLORS.error,
    fontSize: 13,
    fontWeight: '500',
  },
  addSpeakersSection: {
    marginTop: SPACING.sm,
  },
  addSpeakerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  addSpeakerButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
  },
  addSpeakerText: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: '500',
  },
  noMembersText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  // Elite Access styles
  eliteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  eliteIcon: {
    fontSize: 24,
    marginRight: SPACING.sm,
  },
  eliteStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  eliteStat: {
    alignItems: 'center',
  },
  eliteStatNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.primary,
  },
  eliteStatLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  eliteMemberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  eliteAvatar: {
    backgroundColor: '#8B5CF6',
  },
  eliteBadgeText: {
    fontSize: 11,
    color: '#8B5CF6',
    fontWeight: '500',
    marginTop: 2,
  },
  grantEliteButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: '#8B5CF6',
    borderRadius: 6,
  },
  grantEliteText: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: '500',
  },
  // Standard Access styles
  standardMemberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: 'rgba(254, 42, 148, 0.1)',
    borderRadius: 8,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(254, 42, 148, 0.2)',
  },
  standardAvatar: {
    backgroundColor: COLORS.primary,
  },
  standardBadgeText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '500',
    marginTop: 2,
  },
  grantStandardButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
  },
  grantStandardText: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: '500',
  },
  // Room selector styles
  roomSelector: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  roomSelectorItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  roomSelectorItemActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(254, 42, 148, 0.1)',
  },
  roomSelectorIcon: {
    fontSize: 20,
    marginRight: SPACING.xs,
  },
  roomSelectorText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  roomSelectorTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  // Maintenance styles
  maintenanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  maintenanceButtonDisabled: {
    opacity: 0.6,
  },
  maintenanceButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  maintenanceButtonIcon: {
    fontSize: 24,
    marginRight: SPACING.md,
  },
  maintenanceButtonText: {
    flex: 1,
  },
  maintenanceButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  maintenanceButtonSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  fixResultBanner: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  fixResultBannerError: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  fixResultText: {
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'center',
  },
});

export default function ManageScreen() {
  return (
    <ScreenErrorBoundary screenType="admin">
      <ManageScreenContent />
    </ScreenErrorBoundary>
  );
}
