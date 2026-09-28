import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { MenuItem, LibraryCategory, LibrarySubcategory, ChatRoomId } from '../types';

// Category display configuration.
// `roomScope` (optional): if set, the category only appears in the named room's library.
// Categories without a roomScope appear in every room.
export const LIBRARY_CATEGORIES: {
  id: LibraryCategory;
  label: string;
  icon: string;
  description: string;
  roomScope?: ChatRoomId;
}[] = [
  { id: 'training', label: 'Links to Trainings', icon: '🎓', description: 'Educational training resources' },
  { id: 'event', label: 'Links to Events', icon: '📅', description: 'Upcoming events and gatherings' },
  { id: 'journal_prompt', label: 'Journal Prompts', icon: '📝', description: 'Reflection and writing prompts' },
  { id: 'mind_training', label: 'Mind Training', icon: '🧘', description: 'Guided mind journeys and practices' },
  { id: 'mindset', label: 'Mindset Tools', icon: '✨', description: 'Tools for manifestation practice' },
  { id: 'podcast', label: 'Podcasts', icon: '🎙️', description: 'Podcast episodes and shows' },
  { id: 'business_mastery', label: 'Business Mastery', icon: '💼', description: 'Business mastery resources' },
  { id: 'rituals', label: 'Rituals', icon: '🕯️', description: 'Ritual practices and guides' },
  { id: 'motherhood', label: 'Motherhood', icon: '🤱', description: 'Motherhood resources and support' },
  { id: 'audio_library', label: 'Audio Library', icon: '👑', description: 'Wealth activations — Growth Lab only', roomScope: 'growth-lab' },
  { id: 'growth_lab_wins', label: 'Growth Lab Wins', icon: '🏆', description: 'Weekly giveaways — Growth Lab only', roomScope: 'growth-lab' },
  { id: 'growth_lab_templates', label: 'Growth Lab Templates', icon: '📄', description: 'PDFs — Growth Lab only', roomScope: 'growth-lab' },
  // Stored as its own restricted type for secure, query-safe gating, but the
  // client renders these items as a "Growth Lab" subcategory nested
  // under Journal Prompts (see MenuDropdown). PDF upload is optional.
  { id: 'growth_lab_journals', label: 'Growth Lab Journals', icon: '👑', description: 'Journal prompts — Growth Lab only', roomScope: 'growth-lab' },
];

// Categories that are restricted to specific rooms. Used to filter queries
// and Firestore rules for non-privileged users.
export const RICH_GIRL_RESTRICTED_TYPES = ['audio_library', 'growth_lab_wins', 'growth_lab_templates', 'growth_lab_journals'] as const;

// Subcategory display configuration (for journal_prompt and mind_training)
export const LIBRARY_SUBCATEGORIES: {
  id: LibrarySubcategory;
  label: string;
  icon: string;
}[] = [
  { id: 'love_relationships', label: 'Love and Relationships', icon: '💕' },
  { id: 'money_career', label: 'Money and Career', icon: '💰' },
  { id: 'friendships', label: 'Friendships', icon: '🤝' },
  { id: 'self_worth', label: 'Self-Worth', icon: '✨' },
  { id: 'getting_started', label: 'Getting Started', icon: '🎯' },
  { id: 'focus', label: 'Focus', icon: '🔮' },
  { id: 'plan', label: 'Plan', icon: '📋' },
  { id: 'act', label: 'Act', icon: '🔥' },
  { id: 'review', label: 'Review', icon: '🦋' },
  { id: 'daily_practices', label: 'Daily Practices', icon: '🌟' },
  { id: 'spring_sprint', label: 'Spring Sprint', icon: '🌸' },
  // Growth Lab journals (rendered as a subcategory under Journal Prompts)
  { id: 'growth_lab', label: 'Growth Lab 🔒🔑', icon: '👑' },
  // Growth Lab Templates subcategories
  { id: 'templates_instagram', label: 'Instagram', icon: '📸' },
  { id: 'templates_sales_scripts', label: 'Sales Scripts', icon: '💰' },
  { id: 'templates_contracts', label: 'Contracts', icon: '✍️' },
  { id: 'templates_event_planning', label: 'Event Planning', icon: '🎉' },
  { id: 'templates_customer_support', label: 'Customer Support', icon: '🎧' },
  { id: 'templates_email', label: 'Email Templates', icon: '📧' },
  { id: 'templates_marketing', label: 'Marketing', icon: '📣' },
  { id: 'templates_money', label: 'Money', icon: '💰' },
  { id: 'templates_business', label: 'Business', icon: '💼' },
  { id: 'templates_ai', label: 'AI', icon: '🤖' },
];

// Subscribe to active menu items.
// `hasAudioLibraryAccess` controls whether audio_library items are included.
// When false, the query excludes them at the Firestore layer (matches the
// security rule that blocks reads of audio_library items for non-admin,
// non-invited users).
export const subscribeToMenuItems = (
  callback: (items: MenuItem[]) => void,
  hasAudioLibraryAccess: boolean = false
): Unsubscribe => {
  console.log('[MenuService] Setting up subscription, hasAudioLibraryAccess:', hasAudioLibraryAccess);

  const q = hasAudioLibraryAccess
    ? query(
        collection(db, 'menuItems'),
        where('isActive', '==', true),
        orderBy('order', 'asc')
      )
    : query(
        collection(db, 'menuItems'),
        where('isActive', '==', true),
        where('type', 'not-in', [...RICH_GIRL_RESTRICTED_TYPES]),
        orderBy('type', 'asc'),
        orderBy('order', 'asc')
      );

  return onSnapshot(
    q,
    (snapshot) => {
      console.log('[MenuService] Received menu items snapshot:', snapshot.docs.length, 'items');
      const items: MenuItem[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MenuItem[];
      callback(items);
    },
    (error) => {
      console.error('[MenuService] Error subscribing to menu items:', error);
      console.error('[MenuService] Error code:', (error as any).code);
      console.error('[MenuService] Error message:', (error as any).message);
      // Return empty array on error so UI doesn't hang
      callback([]);
    }
  );
};

// Subscribe to all menu items (for admin)
export const subscribeToAllMenuItems = (
  callback: (items: MenuItem[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, 'menuItems'),
    orderBy('order', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: MenuItem[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MenuItem[];
      callback(items);
    },
    (error) => {
      console.error('Error subscribing to all menu items:', error);
      // Return empty array on error so UI doesn't hang
      callback([]);
    }
  );
};

// Add a new menu item
export const addMenuItem = async (
  item: Omit<MenuItem, 'id' | 'createdAt'>
): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, 'menuItems'), {
      ...item,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error adding menu item:', error);
    throw error;
  }
};

// Update a menu item
export const updateMenuItem = async (
  id: string,
  updates: Partial<MenuItem>
): Promise<void> => {
  try {
    await updateDoc(doc(db, 'menuItems', id), updates);
  } catch (error) {
    console.error('Error updating menu item:', error);
    throw error;
  }
};

// Delete a menu item
export const deleteMenuItem = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'menuItems', id));
  } catch (error) {
    console.error('Error deleting menu item:', error);
    throw error;
  }
};

// Toggle menu item active status
export const toggleMenuItemActive = async (
  id: string,
  isActive: boolean
): Promise<void> => {
  try {
    await updateDoc(doc(db, 'menuItems', id), { isActive });
  } catch (error) {
    console.error('Error toggling menu item:', error);
    throw error;
  }
};
