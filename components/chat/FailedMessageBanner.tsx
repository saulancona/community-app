import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS, SPACING } from '../../constants/config';

interface FailedMessage {
  id: string;
  content: string;
  timestamp: number;
  retryCount: number;
  error?: string;
}

interface FailedMessageBannerProps {
  failedMessages: FailedMessage[];
  onRetry: (messageId: string) => Promise<void>;
  onDismiss: (messageId: string) => void;
}

export const FailedMessageBanner: React.FC<FailedMessageBannerProps> = ({
  failedMessages,
  onRetry,
  onDismiss,
}) => {
  if (failedMessages.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>⚠️</Text>
        <Text style={styles.headerText}>
          {failedMessages.length === 1
            ? '1 message failed to send'
            : `${failedMessages.length} messages failed to send`}
        </Text>
      </View>
      <ScrollView
        style={styles.messageList}
        horizontal={failedMessages.length > 1}
        showsHorizontalScrollIndicator={false}
      >
        {failedMessages.map((message) => (
          <FailedMessageItem
            key={message.id}
            message={message}
            onRetry={() => onRetry(message.id)}
            onDismiss={() => onDismiss(message.id)}
            isMultiple={failedMessages.length > 1}
          />
        ))}
      </ScrollView>
    </View>
  );
};

interface FailedMessageItemProps {
  message: FailedMessage;
  onRetry: () => void;
  onDismiss: () => void;
  isMultiple: boolean;
}

const FailedMessageItem: React.FC<FailedMessageItemProps> = ({
  message,
  onRetry,
  onDismiss,
  isMultiple,
}) => {
  const [isRetrying, setIsRetrying] = React.useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  // Truncate message preview
  const previewText = message.content.length > 50
    ? message.content.substring(0, 50) + '...'
    : message.content;

  return (
    <View style={[styles.messageItem, isMultiple && styles.messageItemMultiple]}>
      <View style={styles.messageContent}>
        <Text style={styles.messagePreview} numberOfLines={2}>
          "{previewText}"
        </Text>
        {message.error && (
          <Text style={styles.errorText} numberOfLines={1}>
            {message.error}
          </Text>
        )}
      </View>
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.retryButton, isRetrying && styles.buttonDisabled]}
          onPress={handleRetry}
          disabled={isRetrying}
          accessibilityRole="button"
          accessibilityLabel={isRetrying ? 'Retrying message' : 'Retry sending message'}
        >
          <Text style={styles.retryButtonText}>
            {isRetrying ? 'Retrying...' : 'Retry'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.dismissButton]}
          onPress={onDismiss}
          disabled={isRetrying}
          accessibilityRole="button"
          accessibilityLabel="Dismiss failed message"
        >
          <Text style={styles.dismissButtonText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FEF2F2',
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  headerIcon: {
    fontSize: 14,
    marginRight: SPACING.xs,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
  },
  messageList: {
    flexGrow: 0,
  },
  messageItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  messageItemMultiple: {
    minWidth: 200,
    marginRight: SPACING.sm,
  },
  messageContent: {
    marginBottom: SPACING.xs,
  },
  messagePreview: {
    fontSize: 13,
    color: COLORS.text,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 11,
    color: '#B91C1C',
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  dismissButton: {
    backgroundColor: COLORS.border,
  },
  dismissButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
});
