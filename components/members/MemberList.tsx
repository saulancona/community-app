import React from 'react';
import { FlatList, StyleSheet, View, Text } from 'react-native';
import { User } from '../../types';
import { MemberCard } from './MemberCard';
import { MemberListSkeleton } from '../common/Skeleton';
import { COLORS, SPACING } from '../../constants/config';
import { isUserOnline } from '../../utils/presence';

interface MemberListProps {
  members: User[];
  isLoading?: boolean;
  showRemoveButton?: boolean;
  onRemoveMember?: (member: User) => void;
  onMemberPress?: (member: User) => void;
  ListHeaderComponent?: React.ReactElement;
  ownerId?: string;
  isCurrentUserAdmin?: boolean;
  onPromoteMember?: (member: User) => void;
  onDemoteMember?: (member: User) => void;
}

export const MemberList: React.FC<MemberListProps> = ({
  members,
  isLoading = false,
  showRemoveButton = false,
  onRemoveMember,
  onMemberPress,
  ListHeaderComponent,
  ownerId,
  isCurrentUserAdmin = false,
  onPromoteMember,
  onDemoteMember,
}) => {
  const renderMember = ({ item }: { item: User }) => (
    <MemberCard
      member={item}
      showRemoveButton={showRemoveButton}
      onRemove={() => onRemoveMember?.(item)}
      onPress={onMemberPress ? () => onMemberPress(item) : undefined}
      isOwner={!!ownerId && item.id === ownerId}
      isCurrentUserAdmin={isCurrentUserAdmin}
      onPromote={onPromoteMember ? () => onPromoteMember(item) : undefined}
      onDemote={onDemoteMember ? () => onDemoteMember(item) : undefined}
    />
  );

  if (isLoading) {
    return <MemberListSkeleton />;
  }

  if (members.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No members yet</Text>
        <Text style={styles.emptySubtitle}>
          Add members to start your community
        </Text>
      </View>
    );
  }

  const onlineMembers = members.filter((m) => isUserOnline(m));
  const offlineMembers = members.filter((m) => !isUserOnline(m));

  return (
    <FlatList
      data={[...onlineMembers, ...offlineMembers]}
      renderItem={renderMember}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      accessibilityRole="list"
      accessibilityLabel={`Members list, ${members.length} members, ${onlineMembers.length} online`}
      ListHeaderComponent={
        <>
          {ListHeaderComponent}
          <View style={styles.countContainer}>
            <Text style={styles.countText}>
              {members.length} member{members.length !== 1 ? 's' : ''}
              {onlineMembers.length > 0 && (
                <Text style={styles.onlineCount}>
                  {' '}
                  ({onlineMembers.length} online)
                </Text>
              )}
            </Text>
          </View>
        </>
      }
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
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
  countContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  countText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  onlineCount: {
    color: COLORS.success,
  },
});
