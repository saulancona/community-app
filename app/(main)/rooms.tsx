import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  Alert,
  Image,
  Linking,
  Platform,
  AppState,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatRoomId } from '../../types';
import { SPACING, CHAT_ROOMS as ROOM_CONFIG } from '../../constants/config';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { getRoomSettings } from '../../services/admin';
import { canAccessRoom as hasRoomTierAccess } from '../../services/subscription';


const { width } = Dimensions.get('window');
const CARD_WIDTH = width - SPACING.lg * 2;

// Room logos - growth-lab uses an emoji crown rendered as text
const ROOM_LOGOS: Partial<Record<ChatRoomId, any>> = {
  'inner-circle': require('../../assets/logo-gold.jpeg'),
};

interface RoomConfig {
  id: ChatRoomId;
  name: string;
  description: string;
  gradient: [string, string];
}

const CHAT_ROOMS: RoomConfig[] = [
  {
    id: 'inner-circle',
    name: 'Inner Circle',
    description: 'An exclusive realm for those ready to unlock their highest potential.',
    gradient: ['#E8DCD5', '#E0D4CD'],
  },
  {
    id: 'growth-lab',
    name: 'Growth Lab',
    description: '🔑 Welcome in. The Growth Lab is now unlocked',
    gradient: ['#F5E6C8', '#E8D08F'],
  },
];

const isRoomWithinActiveWindow = (roomId: ChatRoomId): boolean => {
  const config = ROOM_CONFIG[roomId];
  if (!config) return true;
  const now = Date.now();
  if (config.activeFrom && now < new Date(config.activeFrom).getTime()) return false;
  if (config.activeUntil && now > new Date(config.activeUntil).getTime()) return false;
  return true;
};

function RoomsScreenContent() {
  const router = useRouter();
  const { user, refreshUser, signOut, isAuthenticated } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnims = useRef(CHAT_ROOMS.map(() => new Animated.Value(50))).current;
  const [growthLabInvitedIds, setGrowthLabInvitedIds] = useState<string[]>([]);

  // Filter rooms by their active time window (e.g. Growth Lab ends Sep 30, 2026)
  const visibleRooms = CHAT_ROOMS.filter((r) => isRoomWithinActiveWindow(r.id));

  // Load invited member list for the invite-only Growth Lab room
  useEffect(() => {
    if (!isRoomWithinActiveWindow('growth-lab')) return;
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await getRoomSettings('growth-lab');
        const ids = settings.invitedUserIds ?? [];
        console.log('[rooms] growth-lab invite list loaded', {
          count: ids.length,
          includesMe: ids.includes(user.id),
          myId: user.id,
        });
        if (!cancelled) setGrowthLabInvitedIds(ids);
      } catch (e: any) {
        console.error('[rooms] Failed to load growth-lab invites', {
          code: e?.code,
          message: e?.message,
          myId: user.id,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Redirect to login when user signs out
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated]);

  // Auto-refresh user profile when the app is re-focused (e.g. access/membership
  // updated externally). On web: tab becoming visible. On native: app foregrounding.
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          refreshUser();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    } else {
      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          refreshUser();
        }
      });
      return () => subscription.remove();
    }
  }, [refreshUser]);

  useEffect(() => {
    // Fade in the header
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // Stagger animate the cards
    const animations = slideAnims.map((anim, index) =>
      Animated.timing(anim, {
        toValue: 0,
        duration: 500,
        delay: 200 + index * 150,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      })
    );

    Animated.stagger(150, animations).start();
  }, []);

  // Check if user can access a specific room
  const canAccessRoom = (roomId: ChatRoomId): boolean => {
    const config = ROOM_CONFIG[roomId];
    if (!config) return true;

    // Admins always have access to every room
    if (user?.role === 'admin') return true;

    if (config.viewPermission === 'invited-only') {
      if (roomId === 'growth-lab') {
        return !!user && growthLabInvitedIds.includes(user.id);
      }
      return false;
    }

    if (config.viewPermission === 'elite-only') {
      return hasRoomTierAccess(user, 'all-access');
    }

    return true;
  };

  const handleSelectRoom = async (roomId: ChatRoomId) => {
    if (!canAccessRoom(roomId)) {
      // No in-app purchase or external payment links (Apple Guideline 3.1.1).
      // Locked rooms show a neutral message with no upgrade CTA or payment link.
      // Membership/access is managed entirely outside the app.
      Alert.alert(
        'Members Only',
        'You don\'t currently have access to this room.',
        [{ text: 'OK' }]
      );
      return;
    }

    router.push({
      pathname: '/(main)/chat',
      params: { roomId },
    });
  };

  const handleOpenCoachAI = async () => {
    const url = 'https://coach.example.com/login';
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Error opening NorthstarAI:', error);
      Alert.alert('Error', 'Could not open NorthstarAI. Please try again.');
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to sign out?');
      if (confirmed) {
        signOut();
      }
    } else {
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {/* NorthstarAI is hidden on iOS (Apple Guideline 3.1.1 named it as an
            external digital feature). Web members keep it. Re-enable on iOS
            once the Elite IAP subscription ships. */}
        {Platform.OS !== 'ios' && (
          <TouchableOpacity style={styles.coachAiButton} onPress={handleOpenCoachAI} activeOpacity={0.8}>
            <Text style={styles.coachAiButtonText}>🤖 NorthstarAI</Text>
          </TouchableOpacity>
        )}
        <View style={styles.headerSpacer} />
        <TouchableOpacity style={styles.logoutButton} onPress={() => router.push('/(main)/settings')}>
          <Text style={styles.logoutText}>Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.roomsContainer}>
          {visibleRooms.map((room, index) => {
            const isLocked = !canAccessRoom(room.id);
            const lockLabel =
              room.id === 'growth-lab' ? 'INVITE ONLY' : 'ELITE';
            const lockedActionLabel = 'Locked';
            const logoSource = ROOM_LOGOS[room.id];
            return (
              <Animated.View
                key={room.id}
                style={[
                  styles.cardWrapper,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnims[index] }],
                  },
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => handleSelectRoom(room.id)}
                >
                  <View
                    style={[
                      styles.card,
                      { backgroundColor: room.gradient[0] },
                      isLocked && styles.cardLocked,
                    ]}
                  >
                    {isLocked && (
                      <View style={styles.lockBadge}>
                        <Text style={styles.lockIcon}>🔒</Text>
                        <Text style={styles.lockText}>{lockLabel}</Text>
                      </View>
                    )}
                    <View style={styles.cardContent}>
                      {logoSource ? (
                        <Image
                          source={logoSource}
                          style={styles.roomLogo}
                          resizeMode="contain"
                        />
                      ) : (
                        <Text style={styles.roomEmojiLogo}>👑</Text>
                      )}
                      <Text style={[
                        styles.roomName,
                        room.id === 'inner-circle' && styles.roomNameGold,
                        room.id === 'growth-lab' && styles.roomNameGrowthLab,
                      ]}>{room.name}</Text>
                      <Text style={[
                        styles.roomDescription,
                        room.id === 'inner-circle' && styles.roomDescriptionGold,
                        room.id === 'growth-lab' && styles.roomDescriptionGrowthLab,
                      ]}>{room.description}</Text>
                      <View style={[
                        styles.enterButton,
                        isLocked && styles.enterButtonLocked,
                        room.id === 'inner-circle' && !isLocked && styles.enterButtonGold,
                        room.id === 'growth-lab' && !isLocked && styles.enterButtonGrowthLab,
                      ]}>
                        <Text style={[
                          styles.enterButtonText,
                          room.id === 'inner-circle' && !isLocked && styles.enterButtonTextGold,
                          room.id === 'growth-lab' && !isLocked && styles.enterButtonTextGrowthLab,
                        ]}>
                          {isLocked ? lockedActionLabel : 'Enter'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  headerSpacer: {
    flex: 1,
  },
  logoutButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  logoutText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
  },
  roomsContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: SPACING.xl,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    alignSelf: 'center',
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: SPACING.xl * 1.5,
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
      },
    }),
  },
  cardLocked: {
    opacity: 0.85,
  },
  lockBadge: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 215, 0, 0.5)',
    ...Platform.select({
      ios: {
        shadowColor: '#FFD700',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 8px rgba(255, 215, 0, 0.3)',
      },
    }),
  },
  lockIcon: {
    fontSize: 14,
    marginRight: 5,
  },
  lockText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  cardContent: {
    alignItems: 'center',
  },
  roomLogo: {
    width: 72,
    height: 72,
    marginBottom: SPACING.lg,
  },
  roomEmojiLogo: {
    fontSize: 64,
    lineHeight: 72,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  roomCrownLogo: {
    width: 90,
    height: 64,
    marginBottom: SPACING.lg,
  },
  roomName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  roomNameGold: {
    color: '#C5A052',
  },
  roomNameGrowthLab: {
    color: '#8A6B1F',
  },
  roomDescription: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  roomDescriptionGold: {
    color: '#A08040',
    fontStyle: 'italic',
  },
  roomDescriptionGrowthLab: {
    color: '#7A5E1A',
    fontStyle: 'italic',
  },
  coachAiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: 20,
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.45)',
  },
  coachAiButtonText: {
    color: '#C9BCF0',
    fontSize: 13,
    fontWeight: '600',
  },
  enterButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl * 1.5,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 140,
    alignItems: 'center',
  },
  enterButtonGold: {
    backgroundColor: 'rgba(197, 160, 82, 0.2)',
    borderColor: '#C5A052',
    ...Platform.select({
      ios: {
        shadowColor: '#C5A052',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 4px 12px rgba(197, 160, 82, 0.3)',
      },
    }),
  },
  enterButtonGrowthLab: {
    backgroundColor: '#8A6B1F',
    borderColor: '#8A6B1F',
    ...Platform.select({
      ios: {
        shadowColor: '#8A6B1F',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 4px 12px rgba(138, 107, 31, 0.35)',
      },
    }),
  },
  enterButtonLocked: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  enterButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  enterButtonTextGold: {
    color: '#C5A052',
    fontWeight: '700',
  },
  enterButtonTextGrowthLab: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

// Auth loading gate
export default function RoomsScreen() {
  const { isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner fullScreen message="Loading..." />
      </SafeAreaView>
    );
  }

  return <RoomsScreenContent />;
}
