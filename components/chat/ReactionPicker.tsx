import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { COLORS, SPACING } from '../../constants/config';
import { REACTION_EMOJIS } from '../../services/chat';

interface ReactionPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectReaction: (emoji: string) => void;
  position?: { x: number; y: number };
}

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  visible,
  onClose,
  onSelectReaction,
  position,
}) => {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close reaction picker"
      >
        <View
          style={[
            styles.container,
            position && {
              position: 'absolute',
              top: Math.max(60, position.y - 60),
              left: Math.max(10, Math.min(position.x - 100, 200)),
            },
          ]}
          accessibilityRole="menu"
          accessibilityLabel="Reaction picker. Select an emoji to react"
        >
          <View style={styles.pickerRow}>
            {REACTION_EMOJIS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiButton}
                onPress={() => {
                  onSelectReaction(emoji);
                  onClose();
                }}
                activeOpacity={0.7}
                accessibilityRole="menuitem"
                accessibilityLabel={`React with ${emoji}`}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emojiButton: {
    padding: SPACING.xs,
    marginHorizontal: 2,
  },
  emoji: {
    fontSize: 28,
  },
});
