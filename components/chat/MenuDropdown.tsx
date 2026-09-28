import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Linking,
  Pressable,
} from 'react-native';
import { COLORS, SPACING } from '../../constants/config';
import { MenuItem, LibraryCategory, LibrarySubcategory, ChatRoomId } from '../../types';
import { subscribeToMenuItems, LIBRARY_CATEGORIES, LIBRARY_SUBCATEGORIES } from '../../services/menu';

interface MenuDropdownProps {
  visible: boolean;
  onClose: () => void;
  roomId?: ChatRoomId;
  hasAudioLibraryAccess?: boolean;
}

// Helper to check if a category type has a URL to open
const categoryHasUrl = (type: LibraryCategory): boolean => {
  return type === 'training' || type === 'event' || type === 'mind_training' || type === 'podcast' || type === 'growth_lab_wins' || type === 'audio_library' || type === 'growth_lab_templates';
};

// Helper to check if a category has subcategories
const categoryHasSubcategories = (type: LibraryCategory): boolean => {
  return type === 'training' || type === 'journal_prompt' || type === 'mind_training' || type === 'growth_lab_templates';
};

export const MenuDropdown: React.FC<MenuDropdownProps> = ({
  visible,
  onClose,
  roomId,
  hasAudioLibraryAccess = false,
}) => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<LibraryCategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<LibrarySubcategory | 'uncategorized' | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToMenuItems(
      (items) => setMenuItems(items),
      hasAudioLibraryAccess
    );
    return () => unsubscribe();
  }, [hasAudioLibraryAccess]);

  // Group items by category
  const itemsByCategory = useMemo(() => {
    const grouped: Record<LibraryCategory, MenuItem[]> = {
      training: [],
      event: [],
      journal_prompt: [],
      mind_training: [],
      mindset: [],
      podcast: [],
      business_mastery: [],
      rituals: [],
      motherhood: [],
      audio_library: [],
      growth_lab_wins: [],
      growth_lab_templates: [],
      growth_lab_journals: [],
    };

    menuItems.forEach((item) => {
      // Support both 'type' and 'category' fields for backwards compatibility
      let category = (item.type || (item as any).category) as LibraryCategory;
      let displayItem = item;
      // Growth Lab journals are stored as their own restricted type
      // (for secure, query-safe gating) but are displayed as a "Growth Lab
      // Empire" subcategory nested under Journal Prompts.
      if (category === 'growth_lab_journals') {
        category = 'journal_prompt';
        displayItem = { ...item, type: 'journal_prompt', subcategory: 'growth_lab' } as MenuItem;
      }
      if (grouped[category]) {
        grouped[category].push(displayItem);
      }
    });

    return grouped;
  }, [menuItems]);

  // Get categories that have items AND are scoped to the current room
  // (or unscoped — shown everywhere).
  const categoriesWithItems = useMemo(() => {
    return LIBRARY_CATEGORIES.filter(
      (cat) =>
        (!cat.roomScope || cat.roomScope === roomId) &&
        itemsByCategory[cat.id]?.length > 0
    );
  }, [itemsByCategory, roomId]);

  // Get subcategories that have items for a given category
  const getSubcategoriesWithItems = (categoryId: LibraryCategory) => {
    const items = itemsByCategory[categoryId] || [];
    const subcatsWithItems = LIBRARY_SUBCATEGORIES.filter((sub) =>
      items.some((item) => item.subcategory === sub.id)
    );
    // Also check for items without subcategory
    const hasUncategorized = items.some((item) => !item.subcategory);
    return { subcatsWithItems, hasUncategorized };
  };

  // Get items filtered by subcategory
  const getItemsBySubcategory = (categoryId: LibraryCategory, subcategoryId: LibrarySubcategory | 'uncategorized') => {
    const items = itemsByCategory[categoryId] || [];
    if (subcategoryId === 'uncategorized') {
      return items.filter((item) => !item.subcategory);
    }
    return items.filter((item) => item.subcategory === subcategoryId);
  };

  const handleItemPress = (item: MenuItem) => {
    const category = (item.type || (item as any).category) as LibraryCategory;
    const hasUrl = categoryHasUrl(category);
    if (hasUrl && item.url) {
      Linking.openURL(item.url);
      onClose();
    } else {
      // Toggle expanded state for content items
      setExpandedItem(expandedItem === item.id ? null : item.id);
    }
  };

  const handleCategoryPress = (categoryId: LibraryCategory) => {
    if (expandedCategory === categoryId) {
      setExpandedCategory(null);
      setSelectedSubcategory(null);
    } else {
      setExpandedCategory(categoryId);
      setSelectedSubcategory(null);
    }
    setExpandedItem(null); // Reset item expansion when switching categories
  };

  const handleSubcategoryPress = (subcategoryId: LibrarySubcategory | 'uncategorized') => {
    setSelectedSubcategory(selectedSubcategory === subcategoryId ? null : subcategoryId);
    setExpandedItem(null);
  };

  const getCategoryInfo = (type: LibraryCategory) => {
    return LIBRARY_CATEGORIES.find((c) => c.id === type) || {
      icon: '📄',
      label: type,
    };
  };

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
        accessibilityLabel="Close library menu"
      >
        <View style={styles.menuContainer}>
          <Pressable style={{ flex: 1 }} onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle} accessibilityRole="header">
                Library
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close library menu"
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.menuContent}
              showsVerticalScrollIndicator={true}
            >
              {categoriesWithItems.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    No library items available yet
                  </Text>
                  <Text style={styles.emptyStateSubtext}>
                    Check back later for trainings, events, journal prompts, and more
                  </Text>
                </View>
              ) : (
                categoriesWithItems.map((category) => (
                  <View key={category.id} style={styles.categorySection}>
                    {/* Category Header */}
                    <TouchableOpacity
                      style={styles.categoryHeader}
                      onPress={() => handleCategoryPress(category.id)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${category.label} - ${itemsByCategory[category.id].length} items`}
                      accessibilityState={{
                        expanded: expandedCategory === category.id,
                      }}
                    >
                      <Text style={styles.categoryIcon}>{category.icon}</Text>
                      <View style={styles.categoryInfo}>
                        <Text style={styles.categoryLabel}>{category.label}</Text>
                        <Text style={styles.categoryCount}>
                          {itemsByCategory[category.id].length} item
                          {itemsByCategory[category.id].length !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <Text style={styles.expandIcon}>
                        {expandedCategory === category.id ? '▼' : '▶'}
                      </Text>
                    </TouchableOpacity>

                    {/* Category Items - with subcategory support */}
                    {expandedCategory === category.id && (
                      <View style={styles.categoryItems}>
                        {/* Show subcategories for journal_prompt and mind_training */}
                        {categoryHasSubcategories(category.id) ? (
                          <>
                            {/* Subcategory list */}
                            {!selectedSubcategory && (
                              <>
                                {getSubcategoriesWithItems(category.id).subcatsWithItems.map((sub) => (
                                  <TouchableOpacity
                                    key={sub.id}
                                    style={styles.subcategoryItem}
                                    onPress={() => handleSubcategoryPress(sub.id)}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.subcategoryBullet}>•</Text>
                                    <Text style={styles.subcategoryLabel}>{sub.label}</Text>
                                    <Text style={styles.expandIcon}>▶</Text>
                                  </TouchableOpacity>
                                ))}
                                {/* Uncategorized items */}
                                {getSubcategoriesWithItems(category.id).hasUncategorized && (
                                  <TouchableOpacity
                                    style={styles.subcategoryItem}
                                    onPress={() => handleSubcategoryPress('uncategorized')}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={styles.subcategoryBullet}>•</Text>
                                    <Text style={styles.subcategoryLabel}>Other</Text>
                                    <Text style={styles.expandIcon}>▶</Text>
                                  </TouchableOpacity>
                                )}
                              </>
                            )}
                            {/* Items within selected subcategory */}
                            {selectedSubcategory && (
                              <>
                                {/* Back button */}
                                <TouchableOpacity
                                  style={styles.backButton}
                                  onPress={() => setSelectedSubcategory(null)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.backIcon}>◀</Text>
                                  <Text style={styles.backText}>Back to subcategories</Text>
                                </TouchableOpacity>
                                {/* Items */}
                                {getItemsBySubcategory(category.id, selectedSubcategory).map((item) => (
                                  <View key={item.id}>
                                    <TouchableOpacity
                                      style={styles.menuItem}
                                      onPress={() => handleItemPress(item)}
                                      activeOpacity={0.7}
                                    >
                                      <View style={styles.menuItemHeader}>
                                        <View style={styles.menuItemInfo}>
                                          <Text style={styles.menuItemTitle}>
                                            {item.title}
                                          </Text>
                                        </View>
                                        {!categoryHasUrl(category.id) && (
                                          <Text style={styles.itemExpandIcon}>
                                            {expandedItem === item.id ? '▼' : '▶'}
                                          </Text>
                                        )}
                                        {categoryHasUrl(category.id) && (
                                          <Text style={styles.linkIcon}>↗</Text>
                                        )}
                                      </View>
                                    </TouchableOpacity>
                                    {expandedItem === item.id && !categoryHasUrl(category.id) && (
                                      <View style={styles.expandedContent}>
                                        {!!item.content && (
                                          <Text style={styles.expandedText}>
                                            {item.content}
                                          </Text>
                                        )}
                                        {!!item.url && (
                                          <TouchableOpacity
                                            style={styles.pdfLink}
                                            onPress={() => Linking.openURL(item.url!)}
                                            activeOpacity={0.7}
                                            accessibilityRole="link"
                                            accessibilityLabel="View attachment"
                                            accessibilityHint="Opens the attached file"
                                          >
                                            <Text style={styles.pdfLinkText}>📄 View File ↗</Text>
                                          </TouchableOpacity>
                                        )}
                                      </View>
                                    )}
                                  </View>
                                ))}
                              </>
                            )}
                          </>
                        ) : (
                          /* Regular items for categories without subcategories */
                          itemsByCategory[category.id].map((item) => (
                            <View key={item.id}>
                              <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => handleItemPress(item)}
                                activeOpacity={0.7}
                                accessibilityRole={
                                  categoryHasUrl((item.type || (item as any).category) as LibraryCategory)
                                    ? 'link'
                                    : 'button'
                                }
                                accessibilityLabel={item.title}
                                accessibilityHint={
                                  categoryHasUrl((item.type || (item as any).category) as LibraryCategory)
                                    ? 'Opens in browser'
                                    : 'Tap to expand'
                                }
                                accessibilityState={{
                                  expanded: expandedItem === item.id,
                                }}
                              >
                                <View style={styles.menuItemHeader}>
                                  <View style={styles.menuItemInfo}>
                                    <Text style={styles.menuItemTitle}>
                                      {item.title}
                                    </Text>
                                  </View>
                                  {!categoryHasUrl((item.type || (item as any).category) as LibraryCategory) && (
                                    <Text style={styles.itemExpandIcon}>
                                      {expandedItem === item.id ? '▼' : '▶'}
                                    </Text>
                                  )}
                                  {categoryHasUrl((item.type || (item as any).category) as LibraryCategory) && (
                                    <Text style={styles.linkIcon}>↗</Text>
                                  )}
                                </View>
                              </TouchableOpacity>

                              {/* Expanded content for non-link items */}
                              {expandedItem === item.id &&
                                !categoryHasUrl((item.type || (item as any).category) as LibraryCategory) && (
                                  <View style={styles.expandedContent}>
                                    <Text style={styles.expandedText}>
                                      {item.content}
                                    </Text>
                                  </View>
                                )}
                            </View>
                          ))
                        )}
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    paddingTop: 100,
  },
  menuContainer: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: 16,
    maxHeight: '70%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  menuContent: {
    paddingVertical: SPACING.sm,
  },
  emptyState: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  categorySection: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  categoryIcon: {
    fontSize: 24,
    marginRight: SPACING.sm,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  categoryCount: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  expandIcon: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  categoryItems: {
    backgroundColor: COLORS.surface,
  },
  menuItem: {
    paddingHorizontal: SPACING.lg,
    paddingLeft: SPACING.lg + SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.03)',
  },
  menuItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemInfo: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  itemExpandIcon: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  linkIcon: {
    fontSize: 16,
    color: COLORS.primary,
    marginLeft: SPACING.sm,
  },
  expandedContent: {
    paddingHorizontal: SPACING.lg,
    paddingLeft: SPACING.lg + SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  expandedText: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textSecondary,
  },
  pdfLink: {
    marginTop: SPACING.sm,
    alignSelf: 'flex-start',
  },
  pdfLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  subcategoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingLeft: SPACING.lg + SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.03)',
  },
  subcategoryIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  subcategoryBullet: {
    fontSize: 24,
    marginRight: SPACING.sm,
    color: COLORS.text,
    fontWeight: '700',
  },
  subcategoryLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingLeft: SPACING.lg + SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  backIcon: {
    fontSize: 12,
    color: COLORS.primary,
    marginRight: SPACING.xs,
  },
  backText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '500',
  },
});
