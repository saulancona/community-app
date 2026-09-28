import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../../components/common/Button';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToAllMenuItems,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemActive,
  LIBRARY_CATEGORIES,
  LIBRARY_SUBCATEGORIES,
} from '../../services/menu';
import { MenuItem, LibraryCategory, LibrarySubcategory } from '../../types';
import { COLORS, SPACING } from '../../constants/config';
import { uploadAudioBlob, uploadDocumentBlob } from '../../services/images';

// Helper to check if a category type requires a URL (admin types one in)
const categoryRequiresUrl = (type: LibraryCategory): boolean => {
  return type === 'training' || type === 'event' || type === 'mind_training' || type === 'podcast' || type === 'growth_lab_wins';
};

// Helper to check if a category type uses an uploaded audio file (becomes the URL)
const categoryRequiresAudio = (type: LibraryCategory): boolean => {
  return type === 'audio_library';
};

// Helper to check if a category type uses an uploaded PDF (becomes the URL)
const categoryRequiresPdf = (type: LibraryCategory): boolean => {
  return type === 'growth_lab_templates';
};

// Helper to check if a category type supports a PDF upload at all — required
// for templates, OPTIONAL for all journal prompts (including the Growth Lab-only
// growth_lab_journals variant). Controls whether the PDF picker is shown.
const categoryAllowsPdf = (type: LibraryCategory): boolean => {
  return categoryRequiresPdf(type) || type === 'growth_lab_journals' || type === 'journal_prompt';
};

// "Growth Lab" is presented to the admin as a SUBCATEGORY of Journal
// Prompts, but is stored under its own gated type `growth_lab_journals` so the
// shared library query stays safe and the items are Growth Lab-only. This maps the
// form's (category, subcategory) selection to the type actually persisted.
const effectiveStoredType = (
  type: LibraryCategory,
  sub: LibrarySubcategory | ''
): LibraryCategory =>
  type === 'journal_prompt' && sub === 'growth_lab' ? 'growth_lab_journals' : type;

// Helper to check if a category type supports subcategories
const categoryHasSubcategory = (type: LibraryCategory): boolean => {
  return type === 'training' || type === 'journal_prompt' || type === 'mind_training' || type === 'growth_lab_templates';
};

// Subcategories specific to Growth Lab Templates
const RICH_GIRL_TEMPLATE_SUBCATEGORIES = [
  'templates_instagram',
  'templates_sales_scripts',
  'templates_contracts',
  'templates_event_planning',
  'templates_customer_support',
  'templates_email',
  'templates_marketing',
  'templates_money',
  'templates_business',
  'templates_ai',
];

// Subcategories valid for the existing journal_prompt / mind_training / training flow
const LEGACY_SUBCATEGORIES = [
  'love_relationships',
  'money_career',
  'friendships',
  'self_worth',
  'getting_started',
  'focus',
  'plan',
  'act',
  'review',
  'daily_practices',
  'spring_sprint',
];

// Filter the subcategory list shown to the admin so it matches the chosen category.
const allowedSubcategoriesForCategory = (type: LibraryCategory): string[] => {
  if (type === 'growth_lab_templates') return RICH_GIRL_TEMPLATE_SUBCATEGORIES;
  // Only Journal Prompts offers the Growth Lab-only "Growth Lab" subcategory.
  if (type === 'journal_prompt') return [...LEGACY_SUBCATEGORIES, 'growth_lab'];
  return LEGACY_SUBCATEGORIES;
};

export default function MenuManageScreen() {
  const router = useRouter();
  const { user, isAdmin, isLoading: authLoading } = useAuth();

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [itemType, setItemType] = useState<LibraryCategory>('journal_prompt');
  const [subcategory, setSubcategory] = useState<LibrarySubcategory | ''>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  // Audio file selection for categories that use uploaded audio (audio_library)
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  // PDF file selection for growth_lab_templates
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);

  useEffect(() => {
    // Wait for auth to load before checking admin status
    if (authLoading) return;

    if (!isAdmin) {
      router.back();
      return;
    }

    const unsubscribe = subscribeToAllMenuItems((items) => {
      setMenuItems(items);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin, authLoading]);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    }
  };

  const showConfirm = (message: string): boolean => {
    if (Platform.OS === 'web') {
      return window.confirm(message);
    }
    return false;
  };

  const resetForm = () => {
    setItemType('journal_prompt');
    setSubcategory('');
    setTitle('');
    setContent('');
    setUrl('');
    setAudioFile(null);
    setPdfFile(null);
    setEditingItem(null);
  };

  // Document picker for the Growth Lab Templates category (and optional journal
  // attachments). Accepts PDF and Excel (.xlsx/.xls). Built imperatively to
  // mirror the audio picker pattern.
  const openPdfPicker = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept =
      'application/pdf,.pdf,' +
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,' +
      'application/vnd.ms-excel,.xls';
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files && input.files[0];
      try { input.remove(); } catch { /* noop */ }
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) {
        showAlert('File Too Large', 'File must be under 25MB.');
        return;
      }
      const name = file.name.toLowerCase();
      const isAllowed =
        file.type === 'application/pdf' ||
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel' ||
        name.endsWith('.pdf') ||
        name.endsWith('.xlsx') ||
        name.endsWith('.xls');
      if (!isAllowed) {
        showAlert('Wrong File Type', 'Please choose a PDF or Excel (.xlsx/.xls) file.');
        return;
      }
      setPdfFile(file);
    };
    document.body.appendChild(input);
    input.click();
  };

  // Open OS file picker for an audio file (web only). Built imperatively to
  // avoid react-native-web ref-binding quirks with <input> in JSX.
  const openAudioPicker = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files && input.files[0];
      try { input.remove(); } catch { /* noop */ }
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
        showAlert('File Too Large', 'Audio file must be under 50MB.');
        return;
      }
      setAudioFile(file);
    };
    document.body.appendChild(input);
    input.click();
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    // growth_lab_journals is stored as its own gated type but is edited as
    // Journal Prompts → Growth Lab subcategory.
    if (item.type === 'growth_lab_journals') {
      setItemType('journal_prompt');
      setSubcategory('growth_lab');
    } else {
      setItemType(item.type as LibraryCategory);
      setSubcategory(item.subcategory || '');
    }
    setTitle(item.title);
    setContent(item.content);
    setUrl(item.url || '');
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      showAlert('Error', 'Please enter a title');
      return;
    }
    if (!content.trim()) {
      showAlert('Error', 'Please enter content');
      return;
    }
    if (categoryRequiresUrl(itemType) && !url.trim()) {
      showAlert('Error', 'Please enter a URL for this item');
      return;
    }
    // Audio Library requires either a new audio file OR an existing URL (when editing).
    if (categoryRequiresAudio(itemType) && !audioFile && !url.trim()) {
      showAlert('Error', 'Please choose an audio file for this item.');
      return;
    }
    // Growth Lab Templates requires either a new file OR an existing URL (when editing).
    if (categoryRequiresPdf(itemType) && !pdfFile && !url.trim()) {
      showAlert('Error', 'Please choose a PDF or Excel file for this item.');
      return;
    }

    setIsSaving(true);
    try {
      // If user picked a new audio file, upload it now and use the resulting URL
      let finalUrl = url.trim();
      if (categoryRequiresAudio(itemType) && audioFile && user) {
        setIsUploadingAudio(true);
        try {
          finalUrl = await uploadAudioBlob(audioFile, user.id, 'audio-library');
        } finally {
          setIsUploadingAudio(false);
        }
      }
      // The persisted type: 'growth_lab_journals' when the admin picked Journal
      // Prompts + Growth Lab, otherwise the chosen category.
      const storedType = effectiveStoredType(itemType, subcategory);
      const isGrowthLabJournal = storedType === 'growth_lab_journals';

      if (categoryAllowsPdf(storedType) && pdfFile && user) {
        setIsUploadingPdf(true);
        try {
          finalUrl = await uploadDocumentBlob(pdfFile, user.id, 'templates');
        } finally {
          setIsUploadingPdf(false);
        }
      }

      const usesUrl = categoryRequiresUrl(itemType) || categoryRequiresAudio(itemType) || categoryAllowsPdf(storedType);
      // Growth Lab journals are always filed under the single 'growth_lab'
      // subcategory; other types use the picked subcategory.
      const subcategoryFields = isGrowthLabJournal
        ? { subcategory: 'growth_lab' as LibrarySubcategory }
        : categoryHasSubcategory(itemType) && subcategory
        ? { subcategory }
        : {};
      if (editingItem) {
        // Update existing item
        await updateMenuItem(editingItem.id, {
          type: storedType,
          ...subcategoryFields,
          title: title.trim(),
          content: content.trim(),
          // Only persist a URL when we actually have one (PDF is optional for journals).
          ...(usesUrl && finalUrl ? { url: finalUrl } : {}),
        });
        showAlert('Success', 'Library item updated');
      } else {
        // Add new item
        const maxOrder = menuItems.reduce((max, item) => Math.max(max, item.order), 0);
        await addMenuItem({
          type: storedType,
          ...subcategoryFields,
          title: title.trim(),
          content: content.trim(),
          ...(usesUrl && finalUrl ? { url: finalUrl } : {}),
          createdBy: user!.id,
          isActive: true,
          order: maxOrder + 1,
        });
        showAlert('Success', 'Library item added');
      }
      setShowAddModal(false);
      resetForm();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save library item');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: MenuItem) => {
    const confirmed = showConfirm(`Delete "${item.title}"?`);
    if (!confirmed) return;

    try {
      await deleteMenuItem(item.id);
      showAlert('Deleted', 'Menu item has been deleted');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to delete menu item');
    }
  };

  const handleToggleActive = async (item: MenuItem) => {
    try {
      await toggleMenuItemActive(item.id, !item.isActive);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to toggle menu item');
    }
  };

  // Growth Lab journals are stored as 'growth_lab_journals' but shown as Journal
  // Prompts (the "Growth Lab" subcategory carries the distinction).
  const displayType = (type: LibraryCategory): LibraryCategory =>
    type === 'growth_lab_journals' ? 'journal_prompt' : type;

  const getTypeIcon = (type: LibraryCategory) => {
    const category = LIBRARY_CATEGORIES.find(c => c.id === displayType(type));
    return category?.icon || '📄';
  };

  const getTypeLabel = (type: LibraryCategory) => {
    const category = LIBRARY_CATEGORIES.find(c => c.id === displayType(type));
    return category?.label || type;
  };

  const getSubcategoryLabel = (sub: LibrarySubcategory | undefined) => {
    if (!sub) return '';
    const subcategory = LIBRARY_SUBCATEGORIES.find(s => s.id === sub);
    return subcategory?.label || sub;
  };

  if (authLoading || isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner fullScreen message="Loading..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Button
          title="+ Add New Item"
          onPress={() => {
            resetForm();
            setShowAddModal(true);
          }}
          style={styles.addButton}
        />
      </View>

      {/* Menu Items List */}
      <ScrollView style={styles.listContainer}>
        {menuItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No library items yet</Text>
            <Text style={styles.emptySubtitle}>
              Add trainings, events, journal prompts, mind trainings, or mindset tools for your community
            </Text>
          </View>
        ) : (
          menuItems.map((item) => (
            <View
              key={item.id}
              style={[
                styles.itemCard,
                !item.isActive && styles.itemCardInactive,
              ]}
            >
              <View style={styles.itemHeader}>
                <Text style={styles.itemIcon}>{getTypeIcon(item.type)}</Text>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemType}>
                    {getTypeLabel(item.type)}
                    {item.subcategory && ` • ${getSubcategoryLabel(item.subcategory)}`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.activeToggle,
                    item.isActive && styles.activeToggleOn,
                  ]}
                  onPress={() => handleToggleActive(item)}
                >
                  <Text style={styles.activeToggleText}>
                    {item.isActive ? 'ON' : 'OFF'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.itemContent} numberOfLines={2}>
                {item.content}
              </Text>
              {item.url && (
                <Text style={styles.itemUrl} numberOfLines={1}>
                  {item.url}
                </Text>
              )}
              <View style={styles.itemActions}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => openEditModal(item)}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(item)}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowAddModal(false);
          resetForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Edit Item' : 'Add New Item'}
              </Text>

              {/* Type Selector */}
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.typeSelector}>
                {LIBRARY_CATEGORIES.filter((category) => category.id !== 'growth_lab_journals').map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.typeOption,
                      itemType === category.id && styles.typeOptionSelected,
                    ]}
                    onPress={() => setItemType(category.id)}
                  >
                    <Text style={styles.typeOptionIcon}>{category.icon}</Text>
                    <Text
                      style={[
                        styles.typeOptionText,
                        itemType === category.id && styles.typeOptionTextSelected,
                      ]}
                      numberOfLines={2}
                    >
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Subcategory Selector — filtered to the category's valid subcats */}
              {categoryHasSubcategory(itemType) && (
                <>
                  <Text style={styles.inputLabel}>Subcategory</Text>
                  <View style={styles.subcategorySelector}>
                    {LIBRARY_SUBCATEGORIES
                      .filter((sub) => allowedSubcategoriesForCategory(itemType).includes(sub.id))
                      .map((sub) => (
                      <TouchableOpacity
                        key={sub.id}
                        style={[
                          styles.subcategoryOption,
                          subcategory === sub.id && styles.subcategoryOptionSelected,
                        ]}
                        onPress={() => setSubcategory(subcategory === sub.id ? '' : sub.id)}
                      >
                        <Text style={styles.subcategoryOptionIcon}>{sub.icon}</Text>
                        <Text
                          style={[
                            styles.subcategoryOptionText,
                            subcategory === sub.id && styles.subcategoryOptionTextSelected,
                          ]}
                          numberOfLines={2}
                        >
                          {sub.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Title Input */}
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter title..."
                placeholderTextColor={COLORS.textLight}
                value={title}
                onChangeText={setTitle}
              />

              {/* Content Input */}
              <Text style={styles.inputLabel}>
                {categoryRequiresUrl(itemType) ? 'Description' : 'Content'}
              </Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder={
                  itemType === 'journal_prompt'
                    ? 'Enter journal prompt...'
                    : itemType === 'mindset'
                    ? 'Enter mindset tool content...'
                    : 'Enter description...'
                }
                placeholderTextColor={COLORS.textLight}
                value={content}
                onChangeText={setContent}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* URL Input (for categories that need it) */}
              {categoryRequiresUrl(itemType) && (
                <>
                  <Text style={styles.inputLabel}>URL</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="https://..."
                    placeholderTextColor={COLORS.textLight}
                    value={url}
                    onChangeText={setUrl}
                    keyboardType="url"
                    autoCapitalize="none"
                  />
                </>
              )}

              {/* Audio file picker (Audio Library — uploads to Firebase Storage) */}
              {categoryRequiresAudio(itemType) && (
                <>
                  <Text style={styles.inputLabel}>Audio File</Text>
                  <TouchableOpacity
                    style={styles.audioPickerButton}
                    onPress={openAudioPicker}
                    disabled={isSaving || isUploadingAudio}
                    accessibilityRole="button"
                    accessibilityLabel="Choose audio file"
                  >
                    <Text style={styles.audioPickerIcon}>🎵</Text>
                    <Text style={styles.audioPickerText} numberOfLines={1}>
                      {audioFile
                        ? audioFile.name
                        : url
                        ? 'Replace current audio file'
                        : 'Choose audio file (mp3, m4a, wav, etc.)'}
                    </Text>
                  </TouchableOpacity>
                  {audioFile && (
                    <Text style={styles.audioPickerHint}>
                      Size: {(audioFile.size / 1024 / 1024).toFixed(2)} MB
                    </Text>
                  )}
                  {!audioFile && url ? (
                    <Text style={styles.audioPickerHint} numberOfLines={1}>
                      Current: {url}
                    </Text>
                  ) : null}
                  {isUploadingAudio && (
                    <Text style={styles.audioPickerHint}>Uploading audio...</Text>
                  )}
                </>
              )}

              {/* Document picker — PDF or Excel. Required for Growth Lab Templates,
                  optional for Growth Lab journals (uploads to Firebase Storage) */}
              {categoryAllowsPdf(effectiveStoredType(itemType, subcategory)) && (
                <>
                  <Text style={styles.inputLabel}>
                    {categoryRequiresPdf(effectiveStoredType(itemType, subcategory)) ? 'PDF or Excel File' : 'PDF or Excel File (optional)'}
                  </Text>
                  <TouchableOpacity
                    style={styles.audioPickerButton}
                    onPress={openPdfPicker}
                    disabled={isSaving || isUploadingPdf}
                    accessibilityRole="button"
                    accessibilityLabel="Choose PDF or Excel file"
                  >
                    <Text style={styles.audioPickerIcon}>📄</Text>
                    <Text style={styles.audioPickerText} numberOfLines={1}>
                      {pdfFile
                        ? pdfFile.name
                        : url
                        ? 'Replace current file'
                        : 'Choose PDF or Excel file (max 25MB)'}
                    </Text>
                  </TouchableOpacity>
                  {pdfFile && (
                    <Text style={styles.audioPickerHint}>
                      Size: {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                    </Text>
                  )}
                  {!pdfFile && url ? (
                    <Text style={styles.audioPickerHint} numberOfLines={1}>
                      Current: {url}
                    </Text>
                  ) : null}
                  {isUploadingPdf && (
                    <Text style={styles.audioPickerHint}>Uploading file...</Text>
                  )}
                </>
              )}

              {/* Buttons */}
              <View style={styles.modalButtons}>
                <Button
                  title="Cancel"
                  onPress={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  variant="outline"
                  style={styles.modalButton}
                />
                <Button
                  title={editingItem ? 'Save Changes' : 'Add Item'}
                  onPress={handleSave}
                  loading={isSaving}
                  style={styles.modalButton}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    backgroundColor: COLORS.background,
  },
  addButton: {
    height: 50,
  },
  listContainer: {
    flex: 1,
  },
  emptyState: {
    padding: SPACING.xl * 2,
    alignItems: 'center',
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
  itemCard: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemCardInactive: {
    opacity: 0.6,
    backgroundColor: '#f5f5f5',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  itemIcon: {
    fontSize: 24,
    marginRight: SPACING.sm,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  itemType: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  activeToggle: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.textLight,
  },
  activeToggleOn: {
    backgroundColor: COLORS.success,
  },
  activeToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.surface,
  },
  itemContent: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.xs,
  },
  itemUrl: {
    fontSize: 12,
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  editButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  editButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  deleteButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  deleteButtonText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  typeOption: {
    width: '31%',
    flexDirection: 'column',
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 70,
    justifyContent: 'center',
  },
  typeOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(254, 42, 148, 0.1)',
  },
  typeOptionIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  typeOptionText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 13,
  },
  typeOptionTextSelected: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  subcategorySelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  subcategoryOption: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 44,
  },
  subcategoryOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(254, 42, 148, 0.1)',
  },
  subcategoryOptionIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  subcategoryOptionText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },
  subcategoryOptionTextSelected: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  textInput: {
    height: 50,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
  },
  textArea: {
    height: 120,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  modalButton: {
    flex: 1,
    height: 50,
  },
  audioPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.xs,
  },
  audioPickerIcon: {
    fontSize: 22,
    marginRight: SPACING.sm,
  },
  audioPickerText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
  },
  audioPickerHint: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: SPACING.sm,
  },
});
