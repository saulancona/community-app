import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { User } from '../../types';
import { Avatar } from '../common/Avatar';
import { COLORS, SPACING } from '../../constants/config';
import { formatRelativeTime } from '../../utils/formatters';
import { isUserOnline } from '../../utils/presence';

interface MemberCardProps {
  member: User;
  onPress?: () => void;
  showRemoveButton?: boolean;
  onRemove?: () => void;
  isOwner?: boolean;
  isCurrentUserAdmin?: boolean;
  onPromote?: () => void;
  onDemote?: () => void;
}

export const MemberCard: React.FC<MemberCardProps> = ({
  member,
  onPress,
  showRemoveButton = false,
  onRemove,
  isOwner = false,
  isCurrentUserAdmin = false,
  onPromote,
  onDemote,
}) => {
  const online = isUserOnline(member);
  const roleText = member.role === 'admin' ? (isOwner ? ', Owner' : ', Admin') : '';
  const statusText = online ? 'online' : `last seen ${formatRelativeTime(member.lastSeen)}`;
  const accessibilityLabelText = `${member.displayName}${roleText}, ${statusText}`;

  const content = (
    <>
      <Avatar
        name={member.displayName}
        imageUrl={member.avatarUrl}
        size="medium"
        showOnlineStatus
        isOnline={online}
      />
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{member.displayName}</Text>
          {isOwner && (
            <View style={styles.ownerBadge}>
              <Text style={styles.badgeText}>Owner</Text>
            </View>
          )}
          {member.role === 'admin' && !isOwner && (
            <View style={styles.adminBadge}>
              <Text style={styles.badgeText}>Admin</Text>
            </View>
          )}
        </View>
        <Text style={styles.status}>
          {online
            ? 'Online'
            : `Last seen ${formatRelativeTime(member.lastSeen)}`}
        </Text>
        {isCurrentUserAdmin && (member.email || member.phoneNumber) && (
          <Text style={styles.contactInfo}>
            {member.email || member.phoneNumber}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        {isCurrentUserAdmin && !isOwner && member.role !== 'admin' && onPromote && (
          <TouchableOpacity
            style={styles.promoteButton}
            onPress={onPromote}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Promote ${member.displayName} to admin`}
          >
            <Text style={styles.promoteText}>Promote</Text>
          </TouchableOpacity>
        )}
        {isCurrentUserAdmin && !isOwner && member.role === 'admin' && onDemote && (
          <TouchableOpacity
            style={styles.demoteButton}
            onPress={onDemote}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Demote ${member.displayName} from admin`}
          >
            <Text style={styles.demoteText}>Demote</Text>
          </TouchableOpacity>
        )}
        {showRemoveButton && member.role !== 'admin' && !isOwner && (
          <TouchableOpacity
            style={styles.removeButton}
            onPress={onRemove}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${member.displayName} from community`}
            accessibilityHint="Tap to remove this member"
          >
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabelText}
        accessibilityHint="Tap to view member details"
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={styles.container}
      accessibilityLabel={accessibilityLabelText}
    >
      {content}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  info: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  ownerBadge: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: SPACING.sm,
  },
  adminBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: SPACING.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.surface,
    textTransform: 'uppercase',
  },
  status: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  contactInfo: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promoteButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  promoteText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  demoteButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  demoteText: {
    fontSize: 14,
    color: COLORS.warning,
    fontWeight: '600',
  },
  removeButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  removeText: {
    fontSize: 14,
    color: COLORS.error,
    fontWeight: '600',
  },
});
