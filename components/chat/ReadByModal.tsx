import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { COLORS, SPACING } from '../../constants/config';
import { Avatar } from '../common/Avatar';
import { getUserProfile } from '../../services/users';
import { isUserOnline } from '../../utils/presence';
import { formatRelativeTime } from '../../utils/formatters';
import { User } from '../../types';

interface ReadByModalProps {
  visible: boolean;
  readBy: string[];
  senderId: string;
  onClose: () => void;
}

export const ReadByModal: React.FC<ReadByModalProps> = ({
  visible,
  readBy,
  senderId,
  onClose,
}) => {
  const [readers, setReaders] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!visible || !readBy || readBy.length === 0) {
      setReaders([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    // Fetch profiles for everyone in readBy except the sender
    const readerIds = readBy.filter((id) => id !== senderId);

    Promise.all(readerIds.map((id) => getUserProfile(id)))
      .then((profiles) => {
        if (!cancelled) {
          setReaders(profiles.filter((p): p is User => p !== null));
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReaders([]);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [visible, readBy, senderId]);

  const readerCount = readBy ? readBy.filter((id) => id !== senderId).length : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Read by</Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : readers.length > 0 ? (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {readers.map((reader) => {
                const online = isUserOnline(reader);
                return (
                  <View key={reader.id} style={styles.readerRow}>
                    <Avatar
                      name={reader.displayName}
                      imageUrl={reader.avatarUrl}
                      size="small"
                      showOnlineStatus
                      isOnline={online}
                    />
                    <View style={styles.readerInfo}>
                      <Text style={styles.readerName}>{reader.displayName}</Text>
                      <Text style={styles.readerStatus}>
                        {online ? 'Online' : `Last seen ${formatRelativeTime(reader.lastSeen)}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.emptyText}>No one has read this message yet</Text>
          )}

          {!isLoading && readers.length > 0 && (
            <Text style={styles.countText}>
              {readerCount} {readerCount === 1 ? 'person' : 'people'} read this
            </Text>
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
    width: 300,
    maxHeight: 400,
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  loadingContainer: {
    paddingVertical: 40,
  },
  list: {
    maxHeight: 280,
  },
  readerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  readerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  readerName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  readerStatus: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingVertical: 20,
  },
  countText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
});
