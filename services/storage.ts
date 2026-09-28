import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import app from './firebase';

const storage = getStorage(app);

/**
 * Upload a profile picture to Firebase Storage
 * @param userId - The user's ID
 * @param imageUri - The local image URI
 * @returns The download URL of the uploaded image
 */
export const uploadProfilePicture = async (
  userId: string,
  imageUri: string
): Promise<string> => {
  try {
    // Create a reference to the storage location
    const timestamp = Date.now();
    const filename = `profile-pictures/${userId}/${timestamp}.jpg`;
    const storageRef = ref(storage, filename);

    // Convert image URI to blob
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // Upload the blob
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
    });

    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    return downloadURL;
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    throw new Error('Failed to upload profile picture');
  }
};

/**
 * Upload a chat image to Firebase Storage
 * @param userId - The user's ID
 * @param imageUri - The local image URI
 * @returns The download URL and dimensions of the uploaded image
 */
export const uploadChatImage = async (
  userId: string,
  imageUri: string
): Promise<{ url: string; width?: number; height?: number }> => {
  try {
    // Create a reference to the storage location
    const timestamp = Date.now();
    const filename = `chat-images/${userId}/${timestamp}.jpg`;
    const storageRef = ref(storage, filename);

    // Convert image URI to blob
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // Upload the blob
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
    });

    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    return { url: downloadURL };
  } catch (error) {
    console.error('Error uploading chat image:', error);
    throw new Error('Failed to upload image');
  }
};
