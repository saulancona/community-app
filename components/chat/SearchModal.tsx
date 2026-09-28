import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Message } from '../../types';
import { COLORS, SPACING } from '../../constants/config';
import { formatMessageTime, formatMessageDate } from '../../utils/formatters';
import { useSearch } from '../../hooks/useSearch';

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  messages: Message[];
  onSelectMessage?: (message: Message) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  visible,
  onClose,
  messages,
  onSelectMessage,
}) => {
  const inputRef = useRef<TextInput>(null);
  const { searchQuery, setSearchQuery, searchResults, isSearching } = useSearch({
    messages,
  });

  // Focus input when modal opens
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setSearchQuery('');
    }
  }, [visible, setSearchQuery]);

  const handleSelectResult = (message: Message) => {
    if (onSelectMessage) {
      onSelectMessage(message);
    }
    onClose();
  };

  const renderSearchResult = ({ item }: { item: Message }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => handleSelectResult(item)}
      accessibilityRole="button"
      accessibilityLabel={`Message from ${item.senderName}: ${item.content}. Tap to go to message.`}
    >
      <View style={styles.resultHeader}>
        <Text style={styles.resultSender} numberOfLines={1}>
          {item.senderName}
        </Text>
        <Text style={styles.resultTime}>
          {formatMessageDate(item.timestamp)} {formatMessageTime(item.timestamp)}
        </Text>
      </View>
      <Text style={styles.resultContent} numberOfLines={2}>
        {highlightMatch(item.content, searchQuery)}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close search"
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Search Messages</Text>
            <View style={styles.placeholder} />
          </View>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <View style={styles.searchIcon}>
              <SearchIcon color={COLORS.textSecondary} />
            </View>
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search messages..."
              placeholderTextColor={COLORS.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search messages"
              accessibilityHint="Type to search through chat messages"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Text style={styles.clearButtonText}>×</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Results */}
          <View style={styles.results}>
            {isSearching ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadingText}>Searching...</Text>
              </View>
            ) : searchQuery.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  Enter a search term to find messages
                </Text>
              </View>
            ) : searchResults.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No messages found</Text>
                <Text style={styles.emptySubtext}>
                  Try a different search term
                </Text>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                renderItem={renderSearchResult}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.resultsList}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                  <Text style={styles.resultsCount}>
                    {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}
                  </Text>
                }
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Highlight matching text in search results
const highlightMatch = (text: string, query: string): React.ReactNode => {
  if (!query.trim()) return text;

  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));

  return parts.map((part, index) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      return (
        <Text key={index} style={styles.highlight}>
          {part}
        </Text>
      );
    }
    return part;
  });
};

// Escape special regex characters
const escapeRegex = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Simple search icon
const SearchIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.container}>
    <View style={[iconStyles.circle, { borderColor: color }]} />
    <View style={[iconStyles.handle, { backgroundColor: color }]} />
  </View>
);

const iconStyles = StyleSheet.create({
  container: {
    width: 18,
    height: 18,
    position: 'relative',
  },
  circle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  handle: {
    width: 6,
    height: 2,
    borderRadius: 1,
    position: 'absolute',
    bottom: 2,
    right: 0,
    transform: [{ rotate: '45deg' }],
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  closeButtonText: {
    color: COLORS.primary,
    fontSize: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
  },
  placeholder: {
    width: 60,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.chatBackground,
    borderRadius: 10,
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  searchIcon: {
    marginRight: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.sm,
    fontSize: 16,
    color: COLORS.text,
  },
  clearButton: {
    padding: SPACING.xs,
  },
  clearButtonText: {
    fontSize: 20,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  results: {
    flex: 1,
  },
  resultsList: {
    paddingBottom: SPACING.lg,
  },
  resultsCount: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  resultItem: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  resultSender: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  resultTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  resultContent: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  highlight: {
    backgroundColor: 'rgba(255, 215, 0, 0.4)',
    color: COLORS.text,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
