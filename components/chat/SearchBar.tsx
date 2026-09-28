import React from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING } from '../../constants/config';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onClose: () => void;
  isSearching?: boolean;
  resultCount?: number;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  onClose,
  isSearching = false,
  resultCount = 0,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <SearchIcon color={COLORS.textSecondary} />
        <TextInput
          style={styles.input}
          placeholder="Search messages..."
          placeholderTextColor={COLORS.textSecondary}
          value={value}
          onChangeText={onChangeText}
          autoFocus
          returnKeyType="search"
          accessibilityLabel="Search messages"
          accessibilityHint="Type to search through chat messages"
        />
        {isSearching && (
          <ActivityIndicator size="small" color={COLORS.primary} />
        )}
        {value.length > 0 && !isSearching && (
          <Text style={styles.resultCount}>
            {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onClose}
        style={styles.closeButton}
        accessibilityRole="button"
        accessibilityLabel="Cancel search"
      >
        <Text style={styles.closeText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
};

const SearchIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={styles.iconContainer}>
    <View style={[styles.searchCircle, { borderColor: color }]} />
    <View style={[styles.searchHandle, { backgroundColor: color }]} />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  iconContainer: {
    width: 18,
    height: 18,
    marginRight: SPACING.xs,
  },
  searchCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  searchHandle: {
    width: 6,
    height: 2,
    borderRadius: 1,
    position: 'absolute',
    bottom: 2,
    right: 0,
    transform: [{ rotate: '45deg' }],
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: 4,
  },
  resultCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  closeButton: {
    paddingLeft: SPACING.sm,
  },
  closeText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '500',
  },
});
