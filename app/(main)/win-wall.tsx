import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import {
  subscribeToWins,
  submitWin,
  toggleWinReaction,
  updateWin,
  deleteWin,
  computeWeekId,
  labelForWeekId,
} from '../../services/winWall';
import { WinWallEntry } from '../../types';
import { uploadProfilePicture } from '../../services/storage';
import { storage } from '../../services/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { SPACING } from '../../constants/config';
import { blockUser } from '../../services/users';
import { callFunction } from '../../services/firebase';

// Color palette mirroring the mockup (dark wine + gold + pink)
const C = {
  bg: '#2A0A1A',
  bgGradientTop: '#3D0F26',
  card: 'rgba(60, 15, 35, 0.6)',
  cardBorder: 'rgba(255, 215, 130, 0.25)',
  gold: '#E8C76A',
  goldBright: '#F5D77A',
  goldDark: '#8A6B1F',
  pink: '#FE2A94',
  pinkSoft: '#FFC0DC',
  text: '#FFFFFF',
  textSubtle: 'rgba(255, 255, 255, 0.7)',
  textMuted: 'rgba(255, 255, 255, 0.4)',
  inputBg: '#FFFFFF',
  inputText: '#1a1a1a',
  inputPlaceholder: '#888',
};

const REACTION_EMOJIS = ['👑', '❤️', '🔥', '✨'];

type Tab = 'share' | 'wall';

export default function WinWallScreen() {
  const router = useRouter();
  const { user, isAdmin, isLoading: authLoading } = useAuth();

  const [tab, setTab] = useState<Tab>('share');
  const [wins, setWins] = useState<WinWallEntry[]>([]);
  const [isLoadingWins, setIsLoadingWins] = useState(true);
  const [winError, setWinError] = useState<string | null>(null);

  // Share form state
  const [shareName, setShareName] = useState('');
  const [shareDate, setShareDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shareContent, setShareContent] = useState('');
  const [shareImage, setShareImage] = useState<File | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);

  // Edit modal state
  const [editingWin, setEditingWin] = useState<WinWallEntry | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editDate, setEditDate] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Auto-fill name from user profile
  useEffect(() => {
    if (user?.displayName && !shareName) {
      setShareName(user.displayName);
    }
  }, [user?.displayName]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }
    setIsLoadingWins(true);
    setWinError(null);
    const unsub = subscribeToWins(
      (items) => {
        setWins(items);
        setIsLoadingWins(false);
      },
      (err) => {
        console.error('[WinWall] subscription error', err);
        setWinError(err.message || 'Could not load wins. You may not have access.');
        setIsLoadingWins(false);
      }
    );
    return () => unsub();
  }, [user?.id, authLoading]);

  const currentWeekId = useMemo(() => computeWeekId(new Date()), []);
  const currentWeekParticipants = useMemo(() => {
    const ids = new Set<string>();
    for (const w of wins) {
      if (w.weekId === currentWeekId) ids.add(w.userId);
    }
    return ids.size;
  }, [wins, currentWeekId]);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  const openImagePicker = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files && input.files[0];
      try { input.remove(); } catch { /* noop */ }
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        showAlert('Too Large', 'Image must be under 10MB.');
        return;
      }
      setShareImage(file);
    };
    document.body.appendChild(input);
    input.click();
  };

  const handleShareWin = async () => {
    if (!user) return;
    const trimmedContent = shareContent.trim();
    if (!trimmedContent) {
      showAlert('Missing Win', 'Tell us what you achieved!');
      return;
    }
    if (trimmedContent.length > 2000) {
      showAlert('Too Long', 'Wins must be 2000 characters or fewer.');
      return;
    }
    if (!shareDate) {
      showAlert('Missing Date', 'Please pick the date of your win.');
      return;
    }
    setIsSharing(true);
    setShareSuccess(null);
    try {
      // Upload image first if provided
      let imageUrl: string | undefined = undefined;
      if (shareImage) {
        const fileName = `${Date.now()}_${shareImage.name.replace(/[^\w.-]/g, '_')}`;
        const path = `win-wall/${user.id}/${fileName}`;
        const ref = storageRef(storage, path);
        const snap = await uploadBytes(ref, shareImage, {
          contentType: shareImage.type || 'image/jpeg',
        });
        imageUrl = await getDownloadURL(snap.ref);
      }

      await submitWin({
        userId: user.id,
        userName: shareName.trim() || user.displayName,
        userAvatarUrl: user.avatarUrl,
        content: trimmedContent,
        winDate: new Date(shareDate + 'T12:00:00'), // noon local to avoid TZ shifts
        imageUrl,
      });

      // Reset form
      setShareContent('');
      setShareImage(null);
      setShareDate(new Date().toISOString().slice(0, 10));
      setShareSuccess('Your win is on the wall 👑');
      setTab('wall');
      setTimeout(() => setShareSuccess(null), 4500);
    } catch (err: any) {
      console.error('[WinWall] share failed', err);
      showAlert('Couldn’t Share', err?.message || 'Try again in a moment.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleReaction = async (winId: string, emoji: string) => {
    if (!user) return;
    try {
      await toggleWinReaction(winId, emoji, user.id);
    } catch (err: any) {
      console.error('[WinWall] reaction failed', err);
    }
  };

  const openEdit = (win: WinWallEntry) => {
    setEditingWin(win);
    setEditContent(win.content);
    setEditDate(win.winDate.toDate().toISOString().slice(0, 10));
  };

  const closeEdit = () => {
    setEditingWin(null);
    setEditContent('');
    setEditDate('');
  };

  const handleSaveEdit = async () => {
    if (!editingWin) return;
    setIsEditing(true);
    try {
      await updateWin(editingWin.id, {
        content: editContent,
        winDate: new Date(editDate + 'T12:00:00'),
      });
      closeEdit();
    } catch (err: any) {
      showAlert('Edit Failed', err?.message || 'Try again.');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDelete = async (win: WinWallEntry) => {
    const confirm = Platform.OS === 'web'
      ? window.confirm('Delete this win? It will disappear from the wall.')
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Delete Win?', 'It will disappear from the wall.', [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!confirm) return;
    try {
      await deleteWin(win.id);
    } catch (err: any) {
      showAlert('Delete Failed', err?.message || 'Try again.');
    }
  };

  const handleReport = async (win: WinWallEntry) => {
    const ok = Platform.OS === 'web'
      ? window.confirm('Report this win for review by the moderation team?')
      : await new Promise<boolean>((r) => {
          Alert.alert('Report Win?', 'Our team reviews within 24h.', [
            { text: 'Cancel', style: 'cancel', onPress: () => r(false) },
            { text: 'Report', style: 'destructive', onPress: () => r(true) },
          ]);
        });
    if (!ok) return;
    try {
      const reason =
        Platform.OS === 'web'
          ? window.prompt('Optional: tell us why.') || ''
          : '';
      await callFunction('reportMessage', {
        messageId: win.id,
        collectionId: 'growth-lab-wins',
        reason,
      });
      showAlert('Reported', 'Thank you. We will review shortly.');
    } catch (err: any) {
      showAlert('Failed', err?.message || 'Try again.');
    }
  };

  const handleBlock = async (win: WinWallEntry) => {
    if (!user) return;
    const ok = Platform.OS === 'web'
      ? window.confirm(`Block ${win.userName}? Their wins will be hidden from you.`)
      : await new Promise<boolean>((r) => {
          Alert.alert(`Block ${win.userName}?`, 'Their wins will be hidden.', [
            { text: 'Cancel', style: 'cancel', onPress: () => r(false) },
            { text: 'Block', style: 'destructive', onPress: () => r(true) },
          ]);
        });
    if (!ok) return;
    try {
      await blockUser(user.id, win.userId);
      await callFunction('reportMessage', {
        messageId: win.id,
        collectionId: 'growth-lab-wins',
        reason: `User blocked ${win.userName}`,
      }).catch(() => {});
      showAlert('Blocked', `${win.userName} is blocked.`);
    } catch (err: any) {
      showAlert('Failed', err?.message || 'Try again.');
    }
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner fullScreen message="Loading..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.gold,
          title: '',
          headerShown: false,
        }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Back button */}
        <TouchableOpacity
          style={styles.backRow}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to chat"
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        {/* Crown + Title */}
        <View style={styles.header}>
          <Text style={styles.crown}>👑</Text>
          <Text style={styles.titleGold}>Growth Lab Win Wall</Text>
          <Text style={styles.subtitle}>SHARE YOUR WIN. CLAIM YOUR THRONE.</Text>
        </View>

        {/* Prize banner */}
        <View style={styles.prizeBanner}>
          <View style={styles.prizeBannerRow}>
            <Text style={styles.prizeGift}>🎁</Text>
            <Text style={styles.prizeText}>
              <Text style={styles.prizeBold}>Weekly Prize:</Text>
              {'  '}Share a win this week and you're entered to win a{' '}
              <Text style={styles.prizeBold}>free private 30-minute session with Coach Ava</Text>
              {' '}— a{' '}
              <Text style={styles.prizeBold}>$500 value</Text>
              . Winner announced every Monday. <Text style={styles.crownInline}>👑</Text>
            </Text>
          </View>
          <View style={styles.prizeDivider} />
          <Text style={styles.prizeFinePrint}>
            ✦ One entry per member per week — share as many wins as you want, your name goes in once.
          </Text>
          <Text style={styles.prizeStat}>
            {currentWeekParticipants} {currentWeekParticipants === 1 ? 'member' : 'members'} entered this week · {labelForWeekId(currentWeekId)}
          </Text>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, tab === 'share' && styles.tabActive]}
            onPress={() => setTab('share')}
          >
            <Text style={[styles.tabText, tab === 'share' && styles.tabTextActive]}>
              ✦ Share My Win
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'wall' && styles.tabActive]}
            onPress={() => setTab('wall')}
          >
            <Text style={[styles.tabText, tab === 'wall' && styles.tabTextActive]}>
              ✨ Win Wall ({wins.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Success toast */}
        {shareSuccess && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{shareSuccess}</Text>
          </View>
        )}

        {tab === 'share' ? (
          <ShareForm
            shareName={shareName}
            setShareName={setShareName}
            shareDate={shareDate}
            setShareDate={setShareDate}
            shareContent={shareContent}
            setShareContent={setShareContent}
            shareImage={shareImage}
            setShareImage={setShareImage}
            openImagePicker={openImagePicker}
            onSubmit={handleShareWin}
            isSubmitting={isSharing}
          />
        ) : (
          <WinFeed
            wins={wins}
            isLoading={isLoadingWins}
            error={winError}
            currentUserId={user?.id}
            isAdmin={!!isAdmin}
            onReaction={handleReaction}
            onEdit={openEdit}
            onDelete={handleDelete}
            onReport={handleReport}
            onBlock={handleBlock}
          />
        )}
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={!!editingWin} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit your win</Text>
            <Text style={styles.inputLabel}>DATE</Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${C.cardBorder}`,
                  backgroundColor: C.inputBg,
                  color: C.inputText,
                  fontSize: 16,
                  marginBottom: 12,
                  boxSizing: 'border-box',
                } as any}
              />
            ) : (
              <TextInput
                style={styles.modalInput}
                value={editDate}
                onChangeText={setEditDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={C.inputPlaceholder}
              />
            )}
            <Text style={styles.inputLabel}>YOUR WIN</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextarea]}
              value={editContent}
              onChangeText={setEditContent}
              multiline
              numberOfLines={4}
              placeholderTextColor={C.inputPlaceholder}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={closeEdit}>
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonSave}
                onPress={handleSaveEdit}
                disabled={isEditing}
              >
                <Text style={styles.modalButtonSaveText}>
                  {isEditing ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ===== Share Form =====
interface ShareFormProps {
  shareName: string;
  setShareName: (s: string) => void;
  shareDate: string;
  setShareDate: (s: string) => void;
  shareContent: string;
  setShareContent: (s: string) => void;
  shareImage: File | null;
  setShareImage: (f: File | null) => void;
  openImagePicker: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}
const ShareForm: React.FC<ShareFormProps> = (p) => (
  <View style={styles.formCard}>
    <Text style={styles.inputLabel}>YOUR NAME</Text>
    <TextInput
      style={styles.input}
      value={p.shareName}
      onChangeText={p.setShareName}
      placeholder="Your name"
      placeholderTextColor={C.inputPlaceholder}
    />

    <Text style={styles.inputLabel}>DATE OF YOUR WIN</Text>
    {Platform.OS === 'web' ? (
      <input
        type="date"
        value={p.shareDate}
        onChange={(e) => p.setShareDate(e.target.value)}
        style={{
          width: '100%',
          padding: 14,
          borderRadius: 10,
          border: 'none',
          backgroundColor: C.inputBg,
          color: C.inputText,
          fontSize: 16,
          marginBottom: 18,
          boxSizing: 'border-box',
        } as any}
      />
    ) : (
      <TextInput
        style={styles.input}
        value={p.shareDate}
        onChangeText={p.setShareDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={C.inputPlaceholder}
      />
    )}

    <Text style={styles.inputLabel}>YOUR GROWTH LAB WIN ✨</Text>
    <TextInput
      style={[styles.input, styles.textarea]}
      value={p.shareContent}
      onChangeText={p.setShareContent}
      placeholder="Tell us what you achieved, what shifted, what you learned…"
      placeholderTextColor={C.inputPlaceholder}
      multiline
      numberOfLines={6}
    />

    <Text style={styles.inputLabel}>PHOTO (OPTIONAL)</Text>
    <TouchableOpacity
      style={styles.imagePickerButton}
      onPress={p.openImagePicker}
      disabled={p.isSubmitting}
    >
      <Text style={styles.imagePickerIcon}>📷</Text>
      <Text style={styles.imagePickerText} numberOfLines={1}>
        {p.shareImage ? p.shareImage.name : 'Add a photo of your win'}
      </Text>
      {p.shareImage && (
        <TouchableOpacity
          onPress={(e: any) => {
            e?.stopPropagation?.();
            p.setShareImage(null);
          }}
          style={styles.imagePickerClear}
        >
          <Text style={styles.imagePickerClearText}>✕</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>

    <TouchableOpacity
      style={[styles.submitButton, p.isSubmitting && styles.submitButtonDisabled]}
      onPress={p.onSubmit}
      disabled={p.isSubmitting}
    >
      {p.isSubmitting ? (
        <ActivityIndicator size="small" color={C.bg} />
      ) : (
        <Text style={styles.submitButtonText}>Share My Win 👑</Text>
      )}
    </TouchableOpacity>
  </View>
);

// ===== Win Feed =====
interface WinFeedProps {
  wins: WinWallEntry[];
  isLoading: boolean;
  error: string | null;
  currentUserId?: string;
  isAdmin: boolean;
  onReaction: (winId: string, emoji: string) => void;
  onEdit: (win: WinWallEntry) => void;
  onDelete: (win: WinWallEntry) => void;
  onReport: (win: WinWallEntry) => void;
  onBlock: (win: WinWallEntry) => void;
}
const WinFeed: React.FC<WinFeedProps> = ({
  wins,
  isLoading,
  error,
  currentUserId,
  isAdmin,
  onReaction,
  onEdit,
  onDelete,
  onReport,
  onBlock,
}) => {
  if (isLoading) {
    return (
      <View style={styles.feedEmpty}>
        <ActivityIndicator size="large" color={C.gold} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.feedEmpty}>
        <Text style={styles.feedEmptyText}>{error}</Text>
      </View>
    );
  }
  if (wins.length === 0) {
    return (
      <View style={styles.feedEmpty}>
        <Text style={styles.feedEmptyTitle}>The wall is empty</Text>
        <Text style={styles.feedEmptyText}>
          Be the first to claim your throne — tap Share My Win.
        </Text>
      </View>
    );
  }
  return (
    <View>
      {wins.map((win) => (
        <WinCard
          key={win.id}
          win={win}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onReaction={onReaction}
          onEdit={onEdit}
          onDelete={onDelete}
          onReport={onReport}
          onBlock={onBlock}
        />
      ))}
    </View>
  );
};

// ===== Win Card =====
interface WinCardProps {
  win: WinWallEntry;
  currentUserId?: string;
  isAdmin: boolean;
  onReaction: (winId: string, emoji: string) => void;
  onEdit: (win: WinWallEntry) => void;
  onDelete: (win: WinWallEntry) => void;
  onReport: (win: WinWallEntry) => void;
  onBlock: (win: WinWallEntry) => void;
}
const WinCard: React.FC<WinCardProps> = ({
  win,
  currentUserId,
  isAdmin,
  onReaction,
  onEdit,
  onDelete,
  onReport,
  onBlock,
}) => {
  const isOwn = currentUserId === win.userId;
  const canEdit = isOwn && win.createdAt &&
    Date.now() - win.createdAt.toMillis() < 24 * 60 * 60 * 1000;
  const winDateLabel = win.winDate.toDate().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const initials = (win.userName || '?').charAt(0).toUpperCase();

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardAvatar}>
          {win.userAvatarUrl ? (
            <Image source={{ uri: win.userAvatarUrl }} style={styles.cardAvatarImage} />
          ) : (
            <Text style={styles.cardAvatarText}>{initials}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName} numberOfLines={1}>{win.userName}</Text>
          <Text style={styles.cardDate}>Win date: {winDateLabel}</Text>
        </View>
        {(canEdit || isAdmin) && (
          <View style={styles.cardActionsRow}>
            {canEdit && (
              <TouchableOpacity onPress={() => onEdit(win)} style={styles.cardActionBtn}>
                <Text style={styles.cardActionText}>✏️</Text>
              </TouchableOpacity>
            )}
            {(canEdit || isAdmin) && (
              <TouchableOpacity onPress={() => onDelete(win)} style={styles.cardActionBtn}>
                <Text style={styles.cardActionText}>🗑️</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <Text style={styles.cardContent}>{win.content}</Text>

      {win.imageUrl && (
        <Image
          source={{ uri: win.imageUrl }}
          style={styles.cardImage}
          resizeMode="cover"
        />
      )}

      {/* Reactions row */}
      <View style={styles.reactionsRow}>
        {REACTION_EMOJIS.map((emoji) => {
          const bucket = win.reactions?.find((r) => r.emoji === emoji);
          const count = bucket?.userIds.length || 0;
          const reacted = !!currentUserId && bucket?.userIds.includes(currentUserId);
          return (
            <TouchableOpacity
              key={emoji}
              style={[styles.reactionPill, reacted && styles.reactionPillActive]}
              onPress={() => onReaction(win.id, emoji)}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {count > 0 && (
                <Text style={[styles.reactionCount, reacted && styles.reactionCountActive]}>
                  {count}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
        {!isOwn && (
          <>
            <TouchableOpacity onPress={() => onReport(win)} style={styles.cardActionBtn}>
              <Text style={styles.cardActionText}>🚩</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onBlock(win)} style={styles.cardActionBtn}>
              <Text style={styles.cardActionText}>🚫</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xl * 2 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  backArrow: { color: C.gold, fontSize: 28, fontWeight: '300', marginRight: 4 },
  backText: { color: C.gold, fontSize: 16, fontWeight: '500' },
  header: { alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  crown: { fontSize: 56, marginBottom: SPACING.xs },
  titleGold: {
    fontSize: 32,
    fontWeight: '700',
    color: C.gold,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 13,
    color: C.pinkSoft,
    letterSpacing: 3,
    fontWeight: '600',
    textAlign: 'center',
  },
  prizeBanner: {
    marginHorizontal: SPACING.lg,
    backgroundColor: 'rgba(80, 20, 50, 0.55)',
    borderColor: C.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  prizeBannerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  prizeGift: { fontSize: 32, marginRight: SPACING.sm },
  prizeText: { color: C.textSubtle, fontSize: 15, flex: 1, lineHeight: 22 },
  prizeBold: { color: C.goldBright, fontWeight: '700' },
  crownInline: { fontSize: 16 },
  prizeDivider: {
    height: 1,
    backgroundColor: C.cardBorder,
    marginVertical: SPACING.md,
  },
  prizeFinePrint: {
    color: C.pinkSoft,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: SPACING.xs,
  },
  prizeStat: {
    color: C.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 130, 0.15)',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#F5EFE0',
    borderColor: C.gold,
  },
  tabText: { color: C.textMuted, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#1a1a1a' },
  toast: {
    marginHorizontal: SPACING.lg,
    backgroundColor: 'rgba(232, 199, 106, 0.18)',
    borderColor: C.gold,
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  toastText: { color: C.gold, fontSize: 14, textAlign: 'center', fontWeight: '600' },
  formCard: {
    marginHorizontal: SPACING.lg,
    padding: SPACING.lg,
    backgroundColor: 'rgba(40, 8, 25, 0.4)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 130, 0.1)',
  },
  inputLabel: {
    color: C.pink,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: C.inputBg,
    color: C.inputText,
    borderRadius: 10,
    padding: SPACING.md,
    fontSize: 16,
    marginBottom: SPACING.md,
  },
  textarea: { minHeight: 140, textAlignVertical: 'top' },
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    borderColor: C.cardBorder,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  imagePickerIcon: { fontSize: 20, marginRight: SPACING.sm },
  imagePickerText: { flex: 1, color: C.textSubtle, fontSize: 14 },
  imagePickerClear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerClearText: { color: C.text, fontSize: 12, fontWeight: '700' },
  submitButton: {
    backgroundColor: C.pink,
    borderRadius: 999,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  feedEmpty: {
    marginHorizontal: SPACING.lg,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  feedEmptyTitle: {
    color: C.gold,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  feedEmptyText: { color: C.textSubtle, textAlign: 'center', fontSize: 14, lineHeight: 22 },
  card: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: C.card,
    borderRadius: 16,
    borderColor: C.cardBorder,
    borderWidth: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  cardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
    overflow: 'hidden',
  },
  cardAvatarImage: { width: 40, height: 40 },
  cardAvatarText: { color: C.bg, fontWeight: '700', fontSize: 16 },
  cardName: { color: C.text, fontWeight: '700', fontSize: 15 },
  cardDate: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  cardActionsRow: { flexDirection: 'row', gap: 4 },
  cardActionBtn: { padding: 6 },
  cardActionText: { fontSize: 16 },
  cardContent: {
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  reactionPillActive: {
    backgroundColor: 'rgba(232, 199, 106, 0.2)',
    borderColor: C.gold,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { color: C.textSubtle, fontSize: 12, marginLeft: 4, fontWeight: '600' },
  reactionCountActive: { color: C.gold },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: C.bg,
    borderColor: C.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: SPACING.lg,
  },
  modalTitle: {
    color: C.gold,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: C.inputBg,
    color: C.inputText,
    borderRadius: 8,
    padding: SPACING.sm,
    fontSize: 15,
    marginBottom: SPACING.md,
  },
  modalTextarea: { minHeight: 120, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: SPACING.sm },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: 'center',
  },
  modalButtonCancelText: { color: C.textSubtle, fontWeight: '600' },
  modalButtonSave: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 999,
    backgroundColor: C.pink,
    alignItems: 'center',
  },
  modalButtonSaveText: { color: '#FFFFFF', fontWeight: '700' },
});
