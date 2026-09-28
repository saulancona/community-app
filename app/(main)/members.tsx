import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { MemberList } from '../../components/members/MemberList';
import { ScreenErrorBoundary } from '../../components/common/ScreenErrorBoundary';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { getMembers } from '../../services/admin';
import { User } from '../../types';
import { COLORS } from '../../constants/config';

function MembersScreenContent() {
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    setIsLoading(true);
    try {
      const memberList = await getMembers();
      setMembers(memberList);
    } catch (error) {
      console.error('Error loading members:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <MemberList
        members={members}
        isLoading={isLoading}
        showRemoveButton={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});

// Auth loading gate
function MembersScreenWithAuth() {
  const { isLoading: authLoading } = useAuth();

  if (authLoading) {
    return <LoadingSpinner fullScreen message="Loading..." />;
  }

  return <MembersScreenContent />;
}

export default function MembersScreen() {
  return (
    <ScreenErrorBoundary screenType="members">
      <MembersScreenWithAuth />
    </ScreenErrorBoundary>
  );
}
