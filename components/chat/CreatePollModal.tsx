import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Switch,
} from 'react-native';
import { COLORS, SPACING } from '../../constants/config';
import { PollType } from '../../types';

interface CreatePollModalProps {
  visible: boolean;
  onClose: () => void;
  onCreatePoll: (
    question: string,
    options: string[],
    pollType: PollType,
    isAnonymous: boolean,
    expiresAt: Date | null
  ) => Promise<void>;
}

type ExpirationOption = 'never' | '1h' | '24h' | '1w';

const EXPIRATION_OPTIONS: { value: ExpirationOption; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: '1h', label: '1 Hour' },
  { value: '24h', label: '24 Hours' },
  { value: '1w', label: '1 Week' },
];

const getExpirationDate = (option: ExpirationOption): Date | null => {
  const now = new Date();
  switch (option) {
    case '1h':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case '1w':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
};

export const CreatePollModal: React.FC<CreatePollModalProps> = ({
  visible,
  onClose,
  onCreatePoll,
}) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [pollType, setPollType] = useState<PollType>('single');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [expiration, setExpiration] = useState<ExpirationOption>('never');
  const [isCreating, setIsCreating] = useState(false);
  const [showExpirationPicker, setShowExpirationPicker] = useState(false);

  const resetForm = () => {
    setQuestion('');
    setOptions(['', '']);
    setPollType('single');
    setIsAnonymous(false);
    setExpiration('never');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const addOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleCreate = async () => {
    // Validation
    if (!question.trim()) {
      const msg = 'Please enter a question';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Missing Question', msg);
      }
      return;
    }

    const validOptions = options.filter((opt) => opt.trim() !== '');
    if (validOptions.length < 2) {
      const msg = 'Please enter at least 2 options';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Not Enough Options', msg);
      }
      return;
    }

    setIsCreating(true);
    try {
      const expiresAt = getExpirationDate(expiration);
      await onCreatePoll(question.trim(), validOptions, pollType, isAnonymous, expiresAt);
      handleClose();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to create poll';
      if (Platform.OS === 'web') {
        window.alert(errorMsg);
      } else {
        Alert.alert('Error', errorMsg);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create Poll</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Question Input */}
            <View style={styles.section}>
              <Text style={styles.label}>Question</Text>
              <TextInput
                style={styles.questionInput}
                placeholder="What would you like to ask?"
                placeholderTextColor={COLORS.textLight}
                value={question}
                onChangeText={setQuestion}
                multiline
                maxLength={200}
              />
              <Text style={styles.charCount}>{question.length}/200</Text>
            </View>

            {/* Options */}
            <View style={styles.section}>
              <Text style={styles.label}>Options</Text>
              {options.map((option, index) => (
                <View key={index} style={styles.optionRow}>
                  <TextInput
                    style={styles.optionInput}
                    placeholder={`Option ${index + 1}`}
                    placeholderTextColor={COLORS.textLight}
                    value={option}
                    onChangeText={(value) => updateOption(index, value)}
                    maxLength={100}
                  />
                  {options.length > 2 && (
                    <TouchableOpacity
                      style={styles.removeOptionButton}
                      onPress={() => removeOption(index)}
                    >
                      <Text style={styles.removeOptionText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {options.length < 6 && (
                <TouchableOpacity style={styles.addOptionButton} onPress={addOption}>
                  <Text style={styles.addOptionText}>+ Add Option</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Poll Type */}
            <View style={styles.section}>
              <Text style={styles.label}>Poll Type</Text>
              <View style={styles.toggleGroup}>
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    pollType === 'single' && styles.toggleOptionActive,
                  ]}
                  onPress={() => setPollType('single')}
                >
                  <Text
                    style={[
                      styles.toggleOptionText,
                      pollType === 'single' && styles.toggleOptionTextActive,
                    ]}
                  >
                    Single Choice
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    pollType === 'multiple' && styles.toggleOptionActive,
                  ]}
                  onPress={() => setPollType('multiple')}
                >
                  <Text
                    style={[
                      styles.toggleOptionText,
                      pollType === 'multiple' && styles.toggleOptionTextActive,
                    ]}
                  >
                    Multiple Choice
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Anonymous Toggle */}
            <View style={styles.section}>
              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.label}>Anonymous Voting</Text>
                  <Text style={styles.switchDescription}>
                    {isAnonymous
                      ? "Voters' identities will be hidden"
                      : "Voters' identities will be visible"}
                  </Text>
                </View>
                <Switch
                  value={isAnonymous}
                  onValueChange={setIsAnonymous}
                  trackColor={{ false: COLORS.border, true: COLORS.primary }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

            {/* Expiration */}
            <View style={styles.section}>
              <Text style={styles.label}>Expires</Text>
              <TouchableOpacity
                style={styles.expirationPicker}
                onPress={() => setShowExpirationPicker(!showExpirationPicker)}
              >
                <Text style={styles.expirationValue}>
                  {EXPIRATION_OPTIONS.find((opt) => opt.value === expiration)?.label}
                </Text>
                <Text style={styles.dropdownArrow}>▼</Text>
              </TouchableOpacity>

              {showExpirationPicker && (
                <View style={styles.expirationOptions}>
                  {EXPIRATION_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.expirationOption,
                        expiration === opt.value && styles.expirationOptionActive,
                      ]}
                      onPress={() => {
                        setExpiration(opt.value);
                        setShowExpirationPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.expirationOptionText,
                          expiration === opt.value && styles.expirationOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Create Button */}
          <TouchableOpacity
            style={[styles.createButton, isCreating && styles.createButtonDisabled]}
            onPress={handleCreate}
            disabled={isCreating}
          >
            <Text style={styles.createButtonText}>
              {isCreating ? 'Creating...' : 'Create Poll'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  closeButtonText: {
    fontSize: 20,
    color: COLORS.textLight,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  questionInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'right',
    marginTop: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  optionInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    fontSize: 15,
    color: COLORS.text,
  },
  removeOptionButton: {
    marginLeft: SPACING.xs,
    padding: SPACING.xs,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  removeOptionText: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  addOptionButton: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: SPACING.sm,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  addOptionText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 4,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleOptionActive: {
    backgroundColor: COLORS.primary,
  },
  toggleOptionText: {
    fontSize: 14,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  toggleOptionTextActive: {
    color: '#ffffff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchDescription: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  expirationPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  expirationValue: {
    fontSize: 15,
    color: COLORS.text,
  },
  dropdownArrow: {
    fontSize: 10,
    color: COLORS.textLight,
  },
  expirationOptions: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    overflow: 'hidden',
  },
  expirationOption: {
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  expirationOptionActive: {
    backgroundColor: 'rgba(254, 42, 148, 0.1)',
  },
  expirationOptionText: {
    fontSize: 14,
    color: COLORS.text,
  },
  expirationOptionTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default CreatePollModal;
