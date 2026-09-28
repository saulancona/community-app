import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { COLORS, SPACING } from '../../constants/config';

// Simple user type for mentions (minimal info needed)
interface MentionUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

interface MentionPickerProps {
  visible: boolean;
  members: MentionUser[];
  filter: string;
  onSelect: (member: MentionUser) => void;
  onClose: () => void;
}

export const MentionPicker: React.FC<MentionPickerProps> = ({
  visible,
  members,
  filter,
  onSelect,
  onClose,
}) => {
  if (!visible || members.length === 0) return null;

  // Filter members by name (case-insensitive)
  const filteredMembers = filter
    ? members.filter((member) =>
        member.displayName.toLowerCase().includes(filter.toLowerCase())
      )
    : members;

  if (filteredMembers.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Select a member</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.memberList}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        {filteredMembers.slice(0, 10).map((member) => (
          <TouchableOpacity
            key={member.id}
            style={styles.memberItem}
            onPress={() => onSelect(member)}
          >
            {/* Avatar circle with initials */}
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {member.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.memberName}>{member.displayName}</Text>
          </TouchableOpacity>
        ))}
        {filteredMembers.length > 10 && (
          <Text style={styles.moreText}>
            Type more to filter ({filteredMembers.length - 10} more)
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    maxHeight: 250,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  closeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
    lineHeight: 14,
  },
  memberList: {
    paddingVertical: SPACING.xs,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.surface,
  },
  memberName: {
    fontSize: 16,
    color: COLORS.text,
    flex: 1,
  },
  moreText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.sm,
    fontStyle: 'italic',
  },
});
