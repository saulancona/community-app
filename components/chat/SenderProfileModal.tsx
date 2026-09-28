import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING } from '../../constants/config';
import { Avatar } from '../common/Avatar';
import { getUserProfile } from '../../services/users';
import { isUserOnline } from '../../utils/presence';
import { formatRelativeTime } from '../../utils/formatters';
import { User } from '../../types';

interface SenderProfileModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
}

export const SenderProfileModal: React.FC<SenderProfileModalProps> = ({
  visible,
  userId,
  onClose,
}) => {
  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!visible || !userId) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getUserProfile(userId).then((data) => {
      if (!cancelled) {
        setProfile(data);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [visible, userId]);

  const online = profile ? isUserOnline(profile) : false;

  const formatJoinDate = (timestamp: any): string => {
    if (!timestamp) return '';
    try {
      const date = typeof timestamp.toDate === 'function'
        ? timestamp.toDate()
        : timestamp instanceof Date
          ? timestamp
          : new Date(timestamp);
      return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : profile ? (
            <>
              <Avatar
                name={profile.displayName}
                imageUrl={profile.avatarUrl}
                size="large"
                showOnlineStatus
                isOnline={online}
              />

              <Text style={styles.name}>{profile.displayName}</Text>

              {profile.role === 'admin' && (
                <View style={styles.roleBadge}>
                  <Text style={styles.badgeText}>ADMIN</Text>
                </View>
              )}

              <Text style={[styles.status, online && styles.statusOnline]}>
                {online ? 'Online' : `Last seen ${formatRelativeTime(profile.lastSeen)}`}
              </Text>

              {profile.joinedAt && (
                <Text style={styles.joined}>
                  Joined {formatJoinDate(profile.joinedAt)}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.errorText}>Could not load profile</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    alignItems: 'center',
    width: 280,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  closeText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: 40,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 12,
    textAlign: 'center',
  },
  roleBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 8,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  status: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 12,
  },
  statusOnline: {
    color: COLORS.online,
    fontWeight: '600',
  },
  joined: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 4,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.textLight,
    paddingVertical: 20,
  },
});
