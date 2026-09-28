import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle, DimensionValue } from 'react-native';
import { COLORS, SPACING } from '../../constants/config';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

// Base animated skeleton component
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 4,
  style,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as DimensionValue,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
};

// Message skeleton for chat loading
export const MessageSkeleton: React.FC<{ isOwn?: boolean }> = ({ isOwn = false }) => {
  const widths = ['60%', '75%', '45%', '80%', '55%'];
  const randomWidth = widths[Math.floor(Math.random() * widths.length)];

  return (
    <View
      style={[
        styles.messageContainer,
        isOwn ? styles.messageContainerOwn : styles.messageContainerOther,
      ]}
    >
      <View
        style={[
          styles.messageBubble,
          isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
        ]}
      >
        {!isOwn && <Skeleton width={80} height={12} style={styles.senderName} />}
        <Skeleton width={randomWidth} height={14} />
        <View style={styles.messageFooter}>
          <Skeleton width={40} height={10} />
        </View>
      </View>
    </View>
  );
};

// Chat loading skeleton - shows multiple message skeletons
export const ChatLoadingSkeleton: React.FC = () => {
  // Alternate between own and other messages
  const messages = [
    { isOwn: false },
    { isOwn: false },
    { isOwn: true },
    { isOwn: false },
    { isOwn: true },
    { isOwn: true },
    { isOwn: false },
  ];

  return (
    <View style={styles.chatContainer}>
      {messages.map((msg, index) => (
        <MessageSkeleton key={index} isOwn={msg.isOwn} />
      ))}
    </View>
  );
};

// Member card skeleton
export const MemberCardSkeleton: React.FC = () => {
  return (
    <View style={styles.memberCard}>
      <Skeleton width={48} height={48} borderRadius={24} />
      <View style={styles.memberInfo}>
        <Skeleton width={120} height={16} style={styles.memberName} />
        <Skeleton width={80} height={12} />
      </View>
    </View>
  );
};

// Member list skeleton
export const MemberListSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => {
  return (
    <View style={styles.memberListContainer}>
      <View style={styles.memberListHeader}>
        <Skeleton width={100} height={14} />
      </View>
      {Array.from({ length: count }).map((_, index) => (
        <MemberCardSkeleton key={index} />
      ))}
    </View>
  );
};

// Settings section skeleton
export const SettingsSkeleton: React.FC = () => {
  return (
    <View style={styles.settingsContainer}>
      {/* Profile section */}
      <View style={styles.profileSection}>
        <Skeleton width={80} height={80} borderRadius={40} />
        <Skeleton width={150} height={24} style={styles.profileName} />
        <Skeleton width={100} height={14} style={styles.profilePhone} />
      </View>

      {/* Settings sections */}
      {[1, 2, 3].map((section) => (
        <View key={section} style={styles.settingsSection}>
          <Skeleton width={80} height={12} style={styles.sectionTitle} />
          <View style={styles.settingsCard}>
            {[1, 2].map((item) => (
              <View key={item} style={styles.settingsRow}>
                <Skeleton width={100} height={16} />
                <Skeleton width={60} height={16} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: COLORS.border,
  },

  // Message skeleton styles
  chatContainer: {
    flex: 1,
    padding: SPACING.sm,
  },
  messageContainer: {
    flexDirection: 'row',
    marginVertical: SPACING.xs,
  },
  messageContainerOwn: {
    justifyContent: 'flex-end',
  },
  messageContainerOther: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: SPACING.sm,
    borderRadius: 12,
  },
  messageBubbleOwn: {
    backgroundColor: 'rgba(37, 211, 102, 0.15)',
    marginLeft: 60,
  },
  messageBubbleOther: {
    backgroundColor: COLORS.surface,
    marginRight: 60,
  },
  senderName: {
    marginBottom: SPACING.xs,
  },
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACING.xs,
  },

  // Member skeleton styles
  memberListContainer: {
    flex: 1,
  },
  memberListHeader: {
    padding: SPACING.md,
    backgroundColor: COLORS.background,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  memberInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  memberName: {
    marginBottom: SPACING.xs,
  },

  // Settings skeleton styles
  settingsContainer: {
    flex: 1,
    padding: SPACING.lg,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginBottom: SPACING.xl,
  },
  profileName: {
    marginTop: SPACING.md,
  },
  profilePhone: {
    marginTop: SPACING.xs,
  },
  settingsSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  settingsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
});
