import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, auth } from './firebase';

// Generate a unique filename for uploaded images
const generateImageFilename = (userId: string, extension: string = 'jpg'): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${userId}_${timestamp}_${random}.${extension}`;
};

// Upload an image to Firebase Storage
export const uploadImage = async (
  file: File | Blob,
  userId: string,
  folder: string = 'chat-images'
): Promise<string> => {
  try {
    // Determine file extension
    let extension = 'jpg';
    if (file instanceof File) {
      const parts = file.name.split('.');
      if (parts.length > 1) {
        extension = parts[parts.length - 1].toLowerCase();
      }
    } else if (file.type) {
      const mimeToExt: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };
      extension = mimeToExt[file.type] || 'jpg';
    }

    const filename = generateImageFilename(userId, extension);
    const storageRef = ref(storage, `${folder}/${userId}/${filename}`);

    // Upload the file
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || 'image/jpeg',
    });

    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

// Delete an image from Firebase Storage
export const deleteImage = async (imageUrl: string): Promise<void> => {
  try {
    // Extract the path from the URL
    const storageRef = ref(storage, imageUrl);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Error deleting image:', error);
    // Don't throw - image may already be deleted
  }
};

// Upload a video to Firebase Storage via REST API (bypasses CORS/iframe issues)
export const uploadVideo = async (
  file: File | Blob,
  userId: string,
  folder: string = 'chat-videos'
): Promise<string> => {
  try {
    const contentType = file.type || 'video/mp4';
    let extension = 'mp4';
    if (file instanceof File) {
      const parts = file.name.split('.');
      if (parts.length > 1) {
        extension = parts[parts.length - 1].toLowerCase();
      }
    } else {
      const mimeToExt: Record<string, string> = {
        'video/mp4': 'mp4',
        'video/quicktime': 'mov',
        'video/webm': 'webm',
        'video/x-m4v': 'm4v',
      };
      extension = mimeToExt[contentType] || 'mp4';
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${userId}_${timestamp}_${random}.${extension}`;
    const filePath = `${folder}/${userId}/${filename}`;

    // Get auth token for REST API
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    const token = await currentUser.getIdToken();

    // Get the storage bucket name from the storage instance
    const bucketName = storage.app.options.storageBucket;

    // Upload via Firebase Storage REST API (works from iframes)
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o?name=${encodeURIComponent(filePath)}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': contentType,
      },
      body: file,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Video] Upload failed:', response.status, errorText);
      throw new Error(`Video upload failed: ${response.status}`);
    }

    const result = await response.json();
    const downloadToken = result.downloadTokens;

    // Construct the download URL
    const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;
    return downloadURL;
  } catch (error) {
    console.error('Error uploading video:', error);
    throw error;
  }
};

// Generate a unique filename for uploaded audio files
const generateAudioFilename = (userId: string, extension: string = 'm4a'): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${userId}_${timestamp}_${random}.${extension}`;
};

// Upload audio file to Firebase Storage (from URI - for native platforms)
export const uploadAudio = async (
  uri: string,
  userId: string,
  folder: string = 'voice-notes'
): Promise<string> => {
  try {
    // Fetch the audio file as a blob
    const response = await fetch(uri);
    const blob = await response.blob();

    return uploadAudioBlob(blob, userId, folder);
  } catch (error) {
    console.error('Error uploading audio:', error);
    throw error;
  }
};

// Upload audio blob directly to Firebase Storage (for web platform)
export const uploadAudioBlob = async (
  blob: Blob,
  userId: string,
  folder: string = 'voice-notes'
): Promise<string> => {
  try {
    // Determine file extension from content type
    const mimeToExt: Record<string, string> = {
      'audio/m4a': 'm4a',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/aac': 'aac',
      'audio/webm': 'webm',
    };
    const extension = mimeToExt[blob.type] || 'webm';

    const filename = generateAudioFilename(userId, extension);
    const storageRef = ref(storage, `${folder}/${filename}`);

    // Upload the file
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: blob.type || 'audio/webm',
    });

    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading audio blob:', error);
    throw error;
  }
};

// Upload a PDF document blob to Firebase Storage.
// Used by the Growth Lab Templates library category.
export const uploadPdfBlob = async (
  blob: Blob,
  userId: string,
  folder: string = 'templates'
): Promise<string> => {
  try {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${userId}_${timestamp}_${random}.pdf`;
    const storageRef = ref(storage, `${folder}/${filename}`);
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'application/pdf',
    });
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading PDF blob:', error);
    throw error;
  }
};

// Upload a document template (PDF or Excel) to Firebase Storage. The stored
// filename extension and content type are inferred from the picked file so the
// download URL opens correctly in the member's browser/OS. Used by the Rich
// Girl Templates library category. Storage rules restrict this folder to the
// three content types below and a 25MB cap.
export const uploadDocumentBlob = async (
  file: File,
  userId: string,
  folder: string = 'templates'
): Promise<string> => {
  try {
    const nameExt = file.name.split('.').pop()?.toLowerCase() || '';
    let ext = 'pdf';
    let contentType = 'application/pdf';
    if (
      nameExt === 'xlsx' ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      ext = 'xlsx';
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (nameExt === 'xls' || file.type === 'application/vnd.ms-excel') {
      ext = 'xls';
      contentType = 'application/vnd.ms-excel';
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${userId}_${timestamp}_${random}.${ext}`;
    const storageRef = ref(storage, `${folder}/${filename}`);
    const snapshot = await uploadBytes(storageRef, file, { contentType });
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading document blob:', error);
    throw error;
  }
};

// Compression presets for different use cases
export const COMPRESSION_PRESETS = {
  thumbnail: { maxWidth: 200, maxHeight: 200, quality: 0.6 },
  preview: { maxWidth: 600, maxHeight: 600, quality: 0.7 },
  standard: { maxWidth: 1200, maxHeight: 1200, quality: 0.8 },
  high: { maxWidth: 2048, maxHeight: 2048, quality: 0.9 },
} as const;

type CompressionPreset = keyof typeof COMPRESSION_PRESETS;

interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  preserveTransparency?: boolean;
  outputFormat?: 'jpeg' | 'png' | 'webp';
}

// Compress/resize image before upload (for web)
export const compressImage = async (
  file: File,
  maxWidth: number = 1200,
  maxHeight: number = 1200,
  quality: number = 0.8
): Promise<Blob> => {
  return compressImageAdvanced(file, { maxWidth, maxHeight, quality });
};

// Advanced compression with more options
export const compressImageAdvanced = async (
  file: File,
  options: CompressionOptions = {}
): Promise<Blob> => {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.8,
    preserveTransparency = false,
    outputFormat = 'jpeg',
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions while preserving aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        // Apply image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // For JPEG, fill with white background (no transparency)
        if (outputFormat === 'jpeg' && !preserveTransparency) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Determine output format
        let mimeType = 'image/jpeg';
        if (outputFormat === 'png') {
          mimeType = 'image/png';
        } else if (outputFormat === 'webp') {
          mimeType = 'image/webp';
        }

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(img.src); // Clean up
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          mimeType,
          outputFormat === 'png' ? undefined : quality // PNG doesn't use quality
        );
      } else {
        reject(new Error('Failed to get canvas context'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };

    img.src = URL.createObjectURL(file);
  });
};

// Compress using a preset
export const compressWithPreset = async (
  file: File,
  preset: CompressionPreset
): Promise<Blob> => {
  const options = COMPRESSION_PRESETS[preset];
  return compressImageAdvanced(file, options);
};

// Generate a thumbnail for quick preview
export const generateThumbnail = async (file: File): Promise<Blob> => {
  return compressWithPreset(file, 'thumbnail');
};

// Smart compression - automatically chooses best settings based on file
export const smartCompress = async (file: File): Promise<Blob> => {
  // For very large files, use more aggressive compression
  if (file.size > 5 * 1024 * 1024) {
    return compressWithPreset(file, 'standard');
  }

  // For smaller files, use preview quality
  if (file.size > 1 * 1024 * 1024) {
    return compressWithPreset(file, 'preview');
  }

  // For small files, use high quality
  return compressWithPreset(file, 'high');
};

// Get image dimensions without fully loading it
export const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to get image dimensions'));
    };

    img.src = URL.createObjectURL(file);
  });
};

// Estimate compressed size (rough estimate)
export const estimateCompressedSize = (
  originalSize: number,
  originalDimensions: { width: number; height: number },
  targetDimensions: { width: number; height: number },
  quality: number
): number => {
  const originalPixels = originalDimensions.width * originalDimensions.height;
  const targetPixels = targetDimensions.width * targetDimensions.height;
  const pixelRatio = targetPixels / originalPixels;
  const qualityFactor = quality * 0.8 + 0.2; // Quality has diminishing returns

  return Math.round(originalSize * pixelRatio * qualityFactor);
};

// Validate image file
export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Please select a valid image file (JPEG, PNG, GIF, or WebP)' };
  }

  if (file.size > maxSize) {
    return { valid: false, error: 'Image size must be less than 10MB' };
  }

  return { valid: true };
};

// Validate video file
export const validateVideoFile = (file: File): { valid: boolean; error?: string } => {
  const maxSize = 500 * 1024 * 1024; // 500MB
  const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Please select a valid video file (MP4, MOV, or WebM)' };
  }

  if (file.size > maxSize) {
    return { valid: false, error: 'Video size must be less than 500MB' };
  }

  return { valid: true };
};

// Check if a file is a video
export const isVideoFile = (file: File): boolean => {
  return file.type.startsWith('video/');
};

// Open file picker for media (images and videos)
// Input must be appended to the DOM for mobile browsers in iframes
export const pickMedia = (): Promise<File | null> => {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,video/x-m4v';
    input.multiple = false;
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.left = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);

    let resolved = false;

    const cleanup = () => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = (e) => {
      if (resolved) return;
      resolved = true;
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0] || null;
      cleanup();
      resolve(file);
    };

    input.oncancel = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(null);
    };

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(null);
      }
    }, 60000);

    input.click();
  });
};

// Open file picker for images only (legacy, still used by pickImage)
// Input must be appended to the DOM for mobile browsers in iframes
export const pickImage = (): Promise<File | null> => {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';
    input.multiple = false;
    // Hide but keep in DOM (required for mobile/iframe compatibility)
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.left = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);

    let resolved = false;

    const cleanup = () => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = (e) => {
      if (resolved) return;
      resolved = true;
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0] || null;
      cleanup();
      resolve(file);
    };

    input.oncancel = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(null);
    };

    // Fallback: if no event fires within 60s, resolve null and clean up
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(null);
      }
    }, 60000);

    input.click();
  });
};
