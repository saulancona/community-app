import React, { useState, useRef, useCallback, memo } from 'react';
import { View, Text, StyleSheet, TextStyle, StyleProp, Image, TouchableOpacity, Modal, Pressable, Dimensions, Linking, Alert, Platform, TextInput } from 'react-native';
import { Message, PinDuration, ChatRoomId, User } from '../../types';
import { COLORS, SPACING, getRoomConfig } from '../../constants/config';
import { formatMessageTime } from '../../utils/formatters';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { PollBubble } from './PollBubble';
import { SenderProfileModal } from './SenderProfileModal';
import { ReadByModal } from './ReadByModal';
import { blockUser } from '../../services/users';
import { callFunction } from '../../services/firebase';

// Pin duration options
const PIN_DURATION_OPTIONS: { value: PinDuration; label: string; description: string }[] = [
  { value: '24h', label: '24 Hours', description: 'Pin for one day' },
  { value: '1w', label: '1 Week', description: 'Pin for seven days' },
  { value: '1m', label: '1 Month', description: 'Pin for thirty days' },
  { value: 'forever', label: 'Forever', description: 'Pin indefinitely' },
];

// URL regex pattern - matches http, https, and www links
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Parse formatted text and return array of styled segments
interface TextSegment {
  text: string;
  styles: TextStyle[];
}

const parseFormattedText = (content: string): TextSegment[] => {
  const segments: TextSegment[] = [];

  // Regex patterns for formatting (order matters - more specific first)
  // ***text*** = bold + italic
  // **text** = bold
  // *text* or _text_ = italic
  // ~~text~~ = strikethrough
  // `text` = monospace

  const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|~~(.+?)~~|`(.+?)`)/g;

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      segments.push({
        text: content.slice(lastIndex, match.index),
        styles: [],
      });
    }

    const fullMatch = match[0];
    let text = '';
    const styles: TextStyle[] = [];

    if (match[2]) {
      // ***bold italic***
      text = match[2];
      styles.push({ fontWeight: 'bold' }, { fontStyle: 'italic' });
    } else if (match[3]) {
      // **bold**
      text = match[3];
      styles.push({ fontWeight: 'bold' });
    } else if (match[4]) {
      // *italic*
      text = match[4];
      styles.push({ fontStyle: 'italic' });
    } else if (match[5]) {
      // _italic_
      text = match[5];
      styles.push({ fontStyle: 'italic' });
    } else if (match[6]) {
      // ~~strikethrough~~
      text = match[6];
      styles.push({ textDecorationLine: 'line-through' });
    } else if (match[7]) {
      // `monospace`
      text = match[7];
      styles.push({ fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.05)' });
    }

    segments.push({ text, styles });
    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining plain text
  if (lastIndex < content.length) {
    segments.push({
      text: content.slice(lastIndex),
      styles: [],
    });
  }

  return segments.length > 0 ? segments : [{ text: content, styles: [] }];
};

// Handle opening URLs
const openURL = async (url: string) => {
  // Add https:// if the URL starts with www.
  const fullUrl = url.startsWith('www.') ? `https://${url}` : url;

  try {
    const supported = await Linking.canOpenURL(fullUrl);
    if (supported) {
      await Linking.openURL(fullUrl);
    } else {
      if (Platform.OS === 'web') {
        window.open(fullUrl, '_blank');
      } else {
        Alert.alert('Cannot open link', `Unable to open: ${fullUrl}`);
      }
    }
  } catch (error) {
    console.error('Error opening URL:', error);
    if (Platform.OS === 'web') {
      window.open(fullUrl, '_blank');
    }
  }
};

// Parse text and split into regular text and URLs
interface TextPart {
  text: string;
  isUrl: boolean;
}

const parseTextWithUrls = (content: string): TextPart[] => {
  const parts: TextPart[] = [];
  let lastIndex = 0;
  let match;

  // Reset regex lastIndex
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(content)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push({
        text: content.slice(lastIndex, match.index),
        isUrl: false,
      });
    }

    // Add the URL
    parts.push({
      text: match[0],
      isUrl: true,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after the last URL
  if (lastIndex < content.length) {
    parts.push({
      text: content.slice(lastIndex),
      isUrl: false,
    });
  }

  return parts.length > 0 ? parts : [{ text: content, isUrl: false }];
};

// Render formatted text component with URL support
const FormattedText: React.FC<{ content: string; baseStyle: StyleProp<TextStyle>; isOwnMessage: boolean }> = ({
  content,
  baseStyle,
  isOwnMessage
}) => {
  // First split by URLs, then apply formatting to non-URL parts
  const urlParts = parseTextWithUrls(content);

  return (
    <Text style={baseStyle} selectable={true}>
      {urlParts.map((part, partIndex) => {
        if (part.isUrl) {
          // Render clickable URL
          return (
            <Text
              key={`url-${partIndex}`}
              style={[
                styles.linkText,
                isOwnMessage && styles.ownLinkText,
              ]}
              onPress={() => openURL(part.text)}
            >
              {part.text}
            </Text>
          );
        }

        // Apply text formatting to non-URL parts
        const segments = parseFormattedText(part.text);
        return segments.map((segment, segIndex) => (
          <Text
            key={`${partIndex}-${segIndex}`}
            style={[
              ...segment.styles,
              // Adjust monospace background for own messages
              segment.styles.some(s => s.fontFamily === 'monospace') && isOwnMessage
                ? { backgroundColor: 'rgba(255,255,255,0.15)' }
                : {}
            ]}
          >
            {segment.text}
          </Text>
        ));
      })}
    </Text>
  );
};

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  showSenderName?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  totalMembers?: number;
  onReply?: (message: Message) => void;
  onReaction?: (message: Message) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, newContent: string) => Promise<void>;
  canEdit?: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
  onDelete?: (messageId: string) => Promise<void>;
  onPin?: (messageId: string, duration: PinDuration) => Promise<void>;
  onUnpin?: (messageId: string) => Promise<void>;
  // Poll props
  roomId?: ChatRoomId;
  onClosePoll?: (messageId: string) => Promise<void>;
  onReopenPoll?: (messageId: string) => Promise<void>;
  members?: User[];
}

// Message status: 'sent' (1 check), 'delivered' (2 checks), 'read' (2 blue checks)
type MessageStatus = 'sent' | 'delivered' | 'read';

const getMessageStatus = (message: Message, totalMembers: number): MessageStatus => {
  const readByCount = message.readBy?.length || 0;

  // If only sender has it in readBy, it's just sent
  if (readByCount <= 1) {
    return 'sent';
  }

  // If at least one other person has read it, it's read
  // (In a group chat, we consider it "read" when anyone else has seen it)
  if (readByCount > 1) {
    return 'read';
  }

  return 'delivered';
};

// Memoized MessageBubble component to prevent unnecessary re-renders
export const MessageBubble: React.FC<MessageBubbleProps> = memo(({
  message,
  isOwnMessage,
  showSenderName = true,
  isFirstInGroup = true,
  isLastInGroup = true,
  totalMembers = 1,
  onReply,
  onReaction,
  onToggleReaction,
  onEdit,
  onDelete,
  canEdit = false,
  currentUserId,
  isAdmin = false,
  onPin,
  onUnpin,
  roomId,
  onClosePoll,
  onReopenPoll,
  members,
}) => {
  const messageStatus = isOwnMessage ? getMessageStatus(message, totalMembers) : 'read';
  const [showImageModal, setShowImageModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [isEditing, setIsEditing] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showPinDurationModal, setShowPinDurationModal] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [showSenderProfile, setShowSenderProfile] = useState(false);
  const [showReadBy, setShowReadBy] = useState(false);
  const hasReactions = message.reactions && message.reactions.length > 0;

  // Handle edit submission
  const handleEditSubmit = async () => {
    if (!onEdit || editText.trim() === message.content) {
      setShowEditModal(false);
      setEditText(message.content);
      return;
    }

    setIsEditing(true);
    try {
      await onEdit(message.id, editText.trim());
      setShowEditModal(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to edit message';
      if (Platform.OS === 'web') {
        window.alert(errorMessage);
      } else {
        Alert.alert('Edit Failed', errorMessage);
      }
      setEditText(message.content);
    } finally {
      setIsEditing(false);
    }
  };

  // Handle edit cancel
  const handleEditCancel = () => {
    setShowEditModal(false);
    setEditText(message.content);
  };

  if (message.type === 'system') {
    return (
      <View style={styles.systemContainer}>
        <View
          style={styles.systemBubble}
          accessibilityRole="text"
          accessibilityLabel={`System message: ${message.content}`}
        >
          <Text style={styles.systemText} selectable={true}>{message.content}</Text>
        </View>
      </View>
    );
  }

  // Handle poll messages (but only if not deleted — a deleted poll should
  // render as the "message was deleted" placeholder, not the interactive poll)
  if (message.type === 'poll' && message.poll && currentUserId && !message.isDeleted) {
    return (
      <PollBubble
        message={message}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        roomId={roomId}
        onClosePoll={onClosePoll}
        onReopenPoll={onReopenPoll}
        onPin={onPin}
        onUnpin={onUnpin}
        onDelete={onDelete}
        members={members}
      />
    );
  }

  // Handle deleted messages
  if (message.isDeleted) {
    return (
      <View
        style={[
          styles.container,
          isOwnMessage ? styles.ownContainer : styles.otherContainer,
          !isFirstInGroup && styles.groupedMessage,
        ]}
      >
        <View
          style={[
            styles.deletedBubble,
            isOwnMessage ? styles.ownDeletedBubble : styles.otherDeletedBubble,
          ]}
        >
          <Text style={styles.deletedText}>
            {isOwnMessage ? 'You deleted this message' : 'This message was deleted'}
          </Text>
        </View>
      </View>
    );
  }

  // Calculate image dimensions for display
  const getImageDimensions = () => {
    const maxWidth = screenWidth * 0.6;
    const maxHeight = 300;

    if (message.imageWidth && message.imageHeight) {
      const aspectRatio = message.imageWidth / message.imageHeight;

      if (message.imageWidth > message.imageHeight) {
        // Landscape
        const width = Math.min(maxWidth, message.imageWidth);
        const height = width / aspectRatio;
        return { width, height: Math.min(height, maxHeight) };
      } else {
        // Portrait or square
        const height = Math.min(maxHeight, message.imageHeight);
        const width = height * aspectRatio;
        return { width: Math.min(width, maxWidth), height };
      }
    }

    return { width: maxWidth, height: 200 };
  };

  const imageDimensions = message.type === 'image' ? getImageDimensions() : null;

  const handleLongPress = () => {
    if (message.type === 'system') return;
    // Always show the action menu — it conditionally includes Edit/Delete/Pin
    // based on ownership/admin, and always includes React + Reply so any user
    // can reply to (or react to) any message, including photos and videos.
    setShowActionMenu(true);
  };

  // Handle action menu selection
  const handleActionSelect = async (action: 'edit' | 'react' | 'reply' | 'pin' | 'unpin' | 'delete' | 'readby' | 'report' | 'block' | 'save_image') => {
    setShowActionMenu(false);
    switch (action) {
      case 'save_image': {
        // Download the message's image to the user's device.
        // Fetches the image as a Blob so the download works even when the
        // source URL is on a different origin (Firebase Storage).
        const imageUrl = message.imageUrl;
        if (!imageUrl) break;
        try {
          if (Platform.OS === 'web') {
            const response = await fetch(imageUrl, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const ext =
              (blob.type && blob.type.split('/')[1]?.split(';')[0]) ||
              (imageUrl.match(/\.(\w{3,4})(?:\?|$)/)?.[1]) ||
              'jpg';
            const filename = `northstar-${message.id}.${ext}`;
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            // Revoke after a tick so the download has time to start
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
          } else {
            // Native fallback — open the URL so the OS share/save sheet appears
            await Linking.openURL(imageUrl);
          }
        } catch (error: any) {
          const msg = error?.message || 'Failed to save image. Please try again.';
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert('Error', msg);
        }
        break;
      }
      case 'report': {
        // Apple Guideline 1.2 — mechanism to flag objectionable content
        const proceed = Platform.OS === 'web'
          ? window.confirm(
              'Report this message?\n\nOur moderation team will review reports within 24 hours and remove violating content.'
            )
          : await new Promise<boolean>((resolve) => {
              Alert.alert(
                'Report Message',
                'Our moderation team will review reports within 24 hours and remove violating content.',
                [
                  { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                  { text: 'Report', style: 'destructive', onPress: () => resolve(true) },
                ]
              );
            });
        if (!proceed) break;
        try {
          const reason =
            Platform.OS === 'web'
              ? window.prompt('Optional: tell us why you are reporting this message.', '') || ''
              : '';
          const collectionId = roomId
            ? getRoomConfig(roomId).messagesCollection
            : 'messages';
          await callFunction('reportMessage', {
            messageId: message.id,
            collectionId,
            reason,
          });
          if (Platform.OS === 'web') {
            window.alert('Thank you. The report has been submitted.');
          } else {
            Alert.alert('Reported', 'Thank you. The report has been submitted.');
          }
        } catch (error: any) {
          const msg = error?.message || 'Failed to submit report. Please try again.';
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert('Error', msg);
        }
        break;
      }
      case 'block': {
        if (!currentUserId) break;
        // Apple Guideline 1.2 — mechanism to block abusive users
        const proceed = Platform.OS === 'web'
          ? window.confirm(
              `Block ${message.senderName}?\n\nTheir messages will be hidden from your feed and our team will be notified.`
            )
          : await new Promise<boolean>((resolve) => {
              Alert.alert(
                `Block ${message.senderName}?`,
                'Their messages will be hidden from your feed and our team will be notified.',
                [
                  { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                  { text: 'Block', style: 'destructive', onPress: () => resolve(true) },
                ]
              );
            });
        if (!proceed) break;
        try {
          // 1. Add to user's blockedUsers list (hides from feed instantly)
          await blockUser(currentUserId, message.senderId);
          // 2. File a report so the moderation team is notified
          const collectionId = roomId
            ? getRoomConfig(roomId).messagesCollection
            : 'messages';
          await callFunction('reportMessage', {
            messageId: message.id,
            collectionId,
            reason: `User blocked sender (${message.senderName})`,
          }).catch(() => { /* non-fatal if report fails */ });
          if (Platform.OS === 'web') {
            window.alert(`${message.senderName} has been blocked.`);
          } else {
            Alert.alert('Blocked', `${message.senderName} has been blocked.`);
          }
        } catch (error: any) {
          const msg = error?.message || 'Failed to block user. Please try again.';
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert('Error', msg);
        }
        break;
      }
      case 'readby':
        setShowReadBy(true);
        break;
      case 'edit':
        setEditText(message.content);
        setShowEditModal(true);
        break;
      case 'react':
        if (onReaction) onReaction(message);
        break;
      case 'reply':
        if (onReply) onReply(message);
        break;
      case 'delete':
        if (onDelete) {
          const confirmDelete = () => {
            onDelete(message.id).catch((error) => {
              const errorMsg = error instanceof Error ? error.message : 'Failed to delete message';
              if (Platform.OS === 'web') {
                window.alert(errorMsg);
              } else {
                Alert.alert('Delete Failed', errorMsg);
              }
            });
          };
          if (Platform.OS === 'web') {
            if (window.confirm('Delete this message? This cannot be undone.')) {
              confirmDelete();
            }
          } else {
            Alert.alert(
              'Delete Message',
              'Delete this message? This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: confirmDelete },
              ]
            );
          }
        }
        break;
      case 'pin':
        // Show pin duration modal instead of directly pinning
        setShowPinDurationModal(true);
        break;
      case 'unpin':
        if (onUnpin) {
          try {
            await onUnpin(message.id);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to unpin message';
            if (Platform.OS === 'web') {
              window.alert(errorMessage);
            } else {
              Alert.alert('Unpin Failed', errorMessage);
            }
          }
        }
        break;
    }
  };

  // Handle pin with duration
  const handlePinWithDuration = async (duration: PinDuration) => {
    if (!onPin) return;

    setIsPinning(true);
    try {
      await onPin(message.id, duration);
      setShowPinDurationModal(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to pin message';
      if (Platform.OS === 'web') {
        window.alert(errorMessage);
      } else {
        Alert.alert('Pin Failed', errorMessage);
      }
    } finally {
      setIsPinning(false);
    }
  };

  // Handle tapping on an existing reaction to toggle it
  const handleReactionTap = (emoji: string) => {
    if (onToggleReaction) {
      onToggleReaction(message.id, emoji);
    }
  };

  // Double tap to reply - using ref to track last tap time
  const lastTapRef = useRef<number>(0);
  const handlePress = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected - trigger reply
      if (onReply && message.type !== 'system') {
        onReply(message);
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [onReply, message]);

  return (
    <View
      style={[
        styles.container,
        isOwnMessage ? styles.ownContainer : styles.otherContainer,
        !isLastInGroup && styles.groupedMessage,
      ]}
    >
      <View style={[styles.bubbleWrapper, hasReactions && styles.bubbleWrapperWithReactions]}>
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={500}
          style={[
            styles.bubble,
            isOwnMessage ? styles.ownBubble : styles.otherBubble,
            isFirstInGroup && (isOwnMessage ? styles.ownBubbleFirst : styles.otherBubbleFirst),
            isLastInGroup && (isOwnMessage ? styles.ownBubbleLast : styles.otherBubbleLast),
            (message.type === 'image' || message.type === 'video') && styles.imageBubble,
            hasReactions && styles.bubbleWithReactions,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${isOwnMessage ? 'Your message' : `Message from ${message.senderName}`}: ${message.type === 'image' ? 'Photo' : message.type === 'video' ? 'Video' : message.content}. ${formatMessageTime(message.timestamp)}`}
          accessibilityHint="Double tap to reply. Long press, or tap the More button, to react, reply, report, or block."
        >
        {/* Tail/Arrow for last message in group */}
        {isLastInGroup && (
          <View
            style={[
              styles.tail,
              isOwnMessage ? styles.ownTail : styles.otherTail,
            ]}
          />
        )}

        {/* Sender name for group chat (only for others' messages) */}
        {/* Always show sender name on replies so you can see who replied */}
        {!isOwnMessage && showSenderName && (isFirstInGroup || message.replyTo) && (
          <TouchableOpacity
            onPress={() => setShowSenderProfile(true)}
            activeOpacity={0.6}
          >
            <Text style={styles.senderName}>{message.senderName}</Text>
          </TouchableOpacity>
        )}

        {/* Reply preview (if this message is a reply) */}
        {message.replyTo && (
          <View style={[styles.replyPreview, isOwnMessage && styles.ownReplyPreview]}>
            <View style={[styles.replyBar, isOwnMessage && styles.ownReplyBar]} />
            <View style={styles.replyContent}>
              <Text style={[styles.replyName, isOwnMessage && styles.ownReplyName]} numberOfLines={1}>
                {message.replyTo.senderName}
              </Text>
              <Text style={[styles.replyText, isOwnMessage && styles.ownReplyText]} numberOfLines={1}>
                {message.replyTo.type === 'image' ? '📷 Photo' : message.replyTo.type === 'video' ? '🎬 Video' : message.replyTo.type === 'voice' ? '🎤 Voice note' : message.replyTo.content}
              </Text>
            </View>
          </View>
        )}

        {/* Image message */}
        {message.type === 'image' && message.imageUrl && (
          <>
            <Pressable
              onPress={() => setShowImageModal(true)}
              onLongPress={handleLongPress}
              delayLongPress={500}
              accessibilityRole="imagebutton"
              accessibilityLabel="Photo message. Tap to view full screen, long press for actions"
            >
              <Image
                source={{ uri: message.imageUrl }}
                style={[
                  styles.messageImage,
                  imageDimensions,
                ]}
                resizeMode="cover"
                accessibilityRole="image"
                accessibilityLabel={`Photo from ${message.senderName}`}
              />
            </Pressable>

            {/* Image preview modal */}
            <Modal
              visible={showImageModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowImageModal(false)}
            >
              <Pressable
                style={styles.imageModalOverlay}
                onPress={() => setShowImageModal(false)}
              >
                <Image
                  source={{ uri: message.imageUrl }}
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                />
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowImageModal(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close image preview"
                >
                  <Text style={styles.closeButtonText}>×</Text>
                </TouchableOpacity>
              </Pressable>
            </Modal>
          </>
        )}

        {/* Video message */}
        {message.type === 'video' && message.videoUrl && (
          <View style={styles.videoContainer}>
            <video
              src={message.videoUrl}
              controls
              playsInline
              preload="metadata"
              style={{
                width: '100%',
                maxWidth: screenWidth * 0.6,
                maxHeight: 300,
                borderRadius: 8,
                backgroundColor: '#000',
              }}
            />
            {message.videoDuration != null && message.videoDuration > 0 && (
              <View style={styles.videoDurationBadge}>
                <Text style={styles.videoDurationText}>
                  {Math.floor(message.videoDuration / 60)}:{String(message.videoDuration % 60).padStart(2, '0')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Voice note message */}
        {message.type === 'voice' && message.audioUrl && (
          <View style={styles.voiceNoteContainer}>
            <VoiceNotePlayer
              audioUrl={message.audioUrl}
              duration={message.audioDuration}
              isOwnMessage={isOwnMessage}
            />
            <View style={[styles.voiceMetaContainer, isOwnMessage && styles.ownVoiceMeta]}>
              <Text style={[styles.timestamp, isOwnMessage && styles.ownTimestamp]}>
                {formatMessageTime(message.timestamp)}
              </Text>
              {isOwnMessage && (
                <View style={styles.checkmarks}>
                  {messageStatus === 'sent' ? (
                    <CheckMark color="rgba(255, 255, 255, 0.7)" />
                  ) : messageStatus === 'delivered' ? (
                    <>
                      <CheckMark color="rgba(255, 255, 255, 0.7)" />
                      <CheckMark color="rgba(255, 255, 255, 0.7)" style={styles.secondCheck} />
                    </>
                  ) : (
                    <>
                      <CheckMark color="#34B7F1" />
                      <CheckMark color="#34B7F1" style={styles.secondCheck} />
                    </>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Text message content */}
        {message.type === 'text' && (
          <View style={styles.contentRow}>
            <FormattedText
              content={message.content}
              baseStyle={[styles.messageText, isOwnMessage && styles.ownMessageText]}
              isOwnMessage={isOwnMessage}
            />
            <View style={styles.metaContainer}>
              {/* Edited indicator */}
              {message.isEdited && (
                <Text style={[styles.editedIndicator, isOwnMessage && styles.ownEditedIndicator]}>
                  edited
                </Text>
              )}
              <Text style={[styles.timestamp, isOwnMessage && styles.ownTimestamp]}>
                {formatMessageTime(message.timestamp)}
              </Text>
              {/* Read status checkmarks for own messages */}
              {isOwnMessage && (
                <View style={styles.checkmarks}>
                  {messageStatus === 'sent' ? (
                    // Single check for sent
                    <CheckMark color="rgba(255, 255, 255, 0.7)" />
                  ) : messageStatus === 'delivered' ? (
                    // Double grey checks for delivered
                    <>
                      <CheckMark color="rgba(255, 255, 255, 0.7)" />
                      <CheckMark color="rgba(255, 255, 255, 0.7)" style={styles.secondCheck} />
                    </>
                  ) : (
                    // Double blue checks for read
                    <>
                      <CheckMark color="#34B7F1" />
                      <CheckMark color="#34B7F1" style={styles.secondCheck} />
                    </>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Image message timestamp */}
        {message.type === 'image' && (
          <View style={[styles.imageMetaContainer, isOwnMessage && styles.ownImageMeta]}>
            <Text style={[styles.timestamp, isOwnMessage && styles.ownTimestamp]}>
              {formatMessageTime(message.timestamp)}
            </Text>
            {isOwnMessage && (
              <View style={styles.checkmarks}>
                {messageStatus === 'sent' ? (
                  <CheckMark color="rgba(255, 255, 255, 0.7)" />
                ) : messageStatus === 'delivered' ? (
                  <>
                    <CheckMark color="rgba(255, 255, 255, 0.7)" />
                    <CheckMark color="rgba(255, 255, 255, 0.7)" style={styles.secondCheck} />
                  </>
                ) : (
                  <>
                    <CheckMark color="#34B7F1" />
                    <CheckMark color="#34B7F1" style={styles.secondCheck} />
                  </>
                )}
              </View>
            )}
          </View>
        )}
      </Pressable>
      {/* Visible action menu trigger — required by Apple App Review (Guideline 1.2)
          so Report/Block are discoverable via a single tap, not just long-press. */}
      {message.senderId !== 'system' && !message.isDeleted && (
        <TouchableOpacity
          style={[
            styles.moreButton,
            isOwnMessage ? styles.moreButtonOwn : styles.moreButtonOther,
          ]}
          onPress={() => setShowActionMenu(true)}
          accessibilityRole="button"
          accessibilityLabel="More message actions including report and block"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.moreButtonText}>⋯</Text>
        </TouchableOpacity>
      )}

      {/* Reactions display - positioned at bottom left of bubble */}
      {hasReactions && (
        <View style={styles.reactionsContainer}>
          {message.reactions!.map((reaction) => {
            const isUserReacted = currentUserId && reaction.userIds.includes(currentUserId);
            return (
              <TouchableOpacity
                key={reaction.emoji}
                style={[styles.reactionBubble, isUserReacted && styles.userReacted]}
                onPress={() => handleReactionTap(reaction.emoji)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${reaction.emoji} reaction, ${reaction.userIds.length} ${reaction.userIds.length === 1 ? 'person' : 'people'}${isUserReacted ? ', you reacted' : ''}`}
                accessibilityHint="Tap to toggle your reaction"
              >
                <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                {reaction.userIds.length > 1 && (
                  <Text style={styles.reactionCount}>{reaction.userIds.length}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      </View>

      {/* Action Menu Modal (for own editable messages or admin actions) */}
      <Modal
        visible={showActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionMenu(false)}
      >
        <Pressable
          style={styles.actionMenuOverlay}
          onPress={() => setShowActionMenu(false)}
        >
          <View style={styles.actionMenuContainer}>
            {/* Edit option - only for own editable text messages */}
            {isOwnMessage && canEdit && message.type === 'text' && (
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => handleActionSelect('edit')}
                accessibilityRole="button"
                accessibilityLabel="Edit message"
              >
                <Text style={styles.actionMenuIcon}>✏️</Text>
                <Text style={styles.actionMenuText}>Edit</Text>
              </TouchableOpacity>
            )}
            {/* Read by option - only for own messages */}
            {isOwnMessage && (
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => handleActionSelect('readby')}
                accessibilityRole="button"
                accessibilityLabel="See who read this message"
              >
                <Text style={styles.actionMenuIcon}>👁️</Text>
                <Text style={styles.actionMenuText}>Read by</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => handleActionSelect('react')}
              accessibilityRole="button"
              accessibilityLabel="Add reaction"
            >
              <Text style={styles.actionMenuIcon}>😊</Text>
              <Text style={styles.actionMenuText}>React</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => handleActionSelect('reply')}
              accessibilityRole="button"
              accessibilityLabel="Reply to message"
            >
              <Text style={styles.actionMenuIcon}>↩️</Text>
              <Text style={styles.actionMenuText}>Reply</Text>
            </TouchableOpacity>
            {/* Pin/Unpin option - only for admins */}
            {isAdmin && !message.isDeleted && (
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => handleActionSelect(message.isPinned ? 'unpin' : 'pin')}
                accessibilityRole="button"
                accessibilityLabel={message.isPinned ? 'Unpin message' : 'Pin message'}
              >
                <Text style={styles.actionMenuIcon}>{message.isPinned ? '📌' : '📍'}</Text>
                <Text style={styles.actionMenuText}>{message.isPinned ? 'Unpin' : 'Pin'}</Text>
              </TouchableOpacity>
            )}
            {/* Delete option - only for own messages */}
            {isOwnMessage && !message.isDeleted && (
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => handleActionSelect('delete')}
                accessibilityRole="button"
                accessibilityLabel="Delete message"
              >
                <Text style={styles.actionMenuIcon}>🗑️</Text>
                <Text style={[styles.actionMenuText, styles.actionMenuDeleteText]}>Delete</Text>
              </TouchableOpacity>
            )}
            {/* Save Image option — only shows for image messages */}
            {!!message.imageUrl && !message.isDeleted && (
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => handleActionSelect('save_image')}
                accessibilityRole="button"
                accessibilityLabel="Save image to device"
              >
                <Text style={styles.actionMenuIcon}>💾</Text>
                <Text style={styles.actionMenuText}>Save Image</Text>
              </TouchableOpacity>
            )}
            {/* Report option - for any message that isn't your own
                (Apple Guideline 1.2 — UGC moderation) */}
            {!isOwnMessage && !message.isDeleted && (
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => handleActionSelect('report')}
                accessibilityRole="button"
                accessibilityLabel="Report message"
              >
                <Text style={styles.actionMenuIcon}>🚩</Text>
                <Text style={[styles.actionMenuText, styles.actionMenuDeleteText]}>Report</Text>
              </TouchableOpacity>
            )}
            {/* Block option - hide all of a user's messages from your feed */}
            {!isOwnMessage && !message.isDeleted && message.senderId !== 'system' && (
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => handleActionSelect('block')}
                accessibilityRole="button"
                accessibilityLabel={`Block ${message.senderName}`}
              >
                <Text style={styles.actionMenuIcon}>🚫</Text>
                <Text style={[styles.actionMenuText, styles.actionMenuDeleteText]}>Block User</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Edit Message Modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={handleEditCancel}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalContainer}>
            <Text style={styles.editModalTitle}>Edit Message</Text>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              placeholder="Edit your message..."
              placeholderTextColor={COLORS.textSecondary}
              editable={!isEditing}
            />
            <View style={styles.editModalButtons}>
              <TouchableOpacity
                style={[styles.editModalButton, styles.editModalCancelButton]}
                onPress={handleEditCancel}
                disabled={isEditing}
              >
                <Text style={styles.editModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editModalButton, styles.editModalSaveButton, isEditing && styles.editModalButtonDisabled]}
                onPress={handleEditSubmit}
                disabled={isEditing || editText.trim() === message.content}
              >
                <Text style={styles.editModalSaveText}>
                  {isEditing ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.editModalHint}>
              You can edit messages within 15 minutes of sending
            </Text>
          </View>
        </View>
      </Modal>

      {/* Pin Duration Modal */}
      <Modal
        visible={showPinDurationModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPinDurationModal(false)}
      >
        <Pressable
          style={styles.pinDurationOverlay}
          onPress={() => setShowPinDurationModal(false)}
        >
          <Pressable
            style={styles.pinDurationContainer}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pinDurationHeader}>
              <Text style={styles.pinDurationTitle}>📌 Pin Message</Text>
              <TouchableOpacity
                onPress={() => setShowPinDurationModal(false)}
                style={styles.pinDurationCloseButton}
              >
                <Text style={styles.pinDurationCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.pinDurationSubtitle}>
              How long should this message be pinned?
            </Text>
            <View style={styles.pinDurationOptions}>
              {PIN_DURATION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.pinDurationOption,
                    isPinning && styles.pinDurationOptionDisabled,
                  ]}
                  onPress={() => handlePinWithDuration(option.value)}
                  disabled={isPinning}
                >
                  <View style={styles.pinDurationOptionContent}>
                    <Text style={styles.pinDurationOptionLabel}>{option.label}</Text>
                    <Text style={styles.pinDurationOptionDesc}>{option.description}</Text>
                  </View>
                  <Text style={styles.pinDurationOptionArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
            {isPinning && (
              <Text style={styles.pinDurationLoading}>Pinning message...</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sender Profile Modal */}
      {!isOwnMessage && (
        <SenderProfileModal
          visible={showSenderProfile}
          userId={message.senderId}
          onClose={() => setShowSenderProfile(false)}
        />
      )}

      {/* Read By Modal */}
      {isOwnMessage && (
        <ReadByModal
          visible={showReadBy}
          readBy={message.readBy || []}
          senderId={message.senderId}
          onClose={() => setShowReadBy(false)}
        />
      )}
    </View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render when necessary
  // For polls, compare the poll object since votes change
  const prevPoll = prevProps.message.poll;
  const nextPoll = nextProps.message.poll;
  let pollsEqual = true;
  if (prevPoll !== nextPoll) {
    if (!prevPoll || !nextPoll) {
      pollsEqual = false;
    } else {
      pollsEqual = prevPoll.totalVotes === nextPoll.totalVotes &&
                   prevPoll.isClosed === nextPoll.isClosed;
    }
  }

  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.reactions === nextProps.message.reactions &&
    prevProps.message.isEdited === nextProps.message.isEdited &&
    prevProps.message.isDeleted === nextProps.message.isDeleted &&
    prevProps.message.isPinned === nextProps.message.isPinned &&
    pollsEqual &&
    prevProps.isOwnMessage === nextProps.isOwnMessage &&
    prevProps.isFirstInGroup === nextProps.isFirstInGroup &&
    prevProps.isLastInGroup === nextProps.isLastInGroup &&
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.canEdit === nextProps.canEdit &&
    prevProps.isAdmin === nextProps.isAdmin
  );
});

// Double checkmark component (WhatsApp-style)
const CheckMark: React.FC<{ color: string; style?: any }> = ({ color, style }) => (
  <View style={[styles.checkmark, style]}>
    <View style={[styles.checkLine1, { backgroundColor: color }]} />
    <View style={[styles.checkLine2, { backgroundColor: color }]} />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: SPACING.sm,
    marginVertical: 1,
  },
  groupedMessage: {
    marginVertical: 1,
  },
  ownContainer: {
    justifyContent: 'flex-end',
  },
  otherContainer: {
    justifyContent: 'flex-start',
  },
  bubbleWrapper: {
    position: 'relative',
    maxWidth: '80%',
  },
  bubbleWrapperWithReactions: {
    marginBottom: 14,
  },
  bubbleWithReactions: {
    paddingBottom: SPACING.sm + 4,
  },
  bubble: {
    minWidth: 80,
    paddingTop: SPACING.xs + 2,
    paddingBottom: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: 8,
    position: 'relative',
  },
  ownBubble: {
    backgroundColor: COLORS.messageSent,
    borderTopRightRadius: 8,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  otherBubble: {
    backgroundColor: COLORS.messageReceived,
    borderTopRightRadius: 8,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  ownBubbleFirst: {
    borderTopRightRadius: 8,
  },
  otherBubbleFirst: {
    borderTopLeftRadius: 8,
  },
  ownBubbleLast: {
    borderBottomRightRadius: 2,
  },
  otherBubbleLast: {
    borderBottomLeftRadius: 2,
  },
  tail: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    height: 0,
    borderStyle: 'solid',
  },
  ownTail: {
    right: -8,
    borderWidth: 8,
    borderColor: 'transparent',
    borderLeftColor: COLORS.messageSent,
    borderBottomColor: COLORS.messageSent,
    borderBottomRightRadius: 4,
  },
  otherTail: {
    left: -8,
    borderWidth: 8,
    borderColor: 'transparent',
    borderRightColor: COLORS.messageReceived,
    borderBottomColor: COLORS.messageReceived,
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryLight,
    marginBottom: 2,
  },
  contentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: COLORS.text,
    flexShrink: 1,
  },
  ownMessageText: {
    color: '#ffffff',
  },
  linkText: {
    color: '#0066CC',
    textDecorationLine: 'underline',
  },
  ownLinkText: {
    color: '#ADD8FF',
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: SPACING.sm,
    marginBottom: -2,
  },
  timestamp: {
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.45)',
  },
  ownTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  checkmarks: {
    flexDirection: 'row',
    marginLeft: 3,
  },
  checkmark: {
    width: 10,
    height: 10,
    position: 'relative',
  },
  secondCheck: {
    marginLeft: -6,
  },
  checkLine1: {
    position: 'absolute',
    width: 2,
    height: 6,
    borderRadius: 1,
    bottom: 2,
    left: 2,
    transform: [{ rotate: '-45deg' }],
  },
  checkLine2: {
    position: 'absolute',
    width: 2,
    height: 10,
    borderRadius: 1,
    bottom: 0,
    right: 2,
    transform: [{ rotate: '45deg' }],
  },
  // Deleted message styles
  deletedBubble: {
    maxWidth: '80%',
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0, 0, 0, 0.15)',
  },
  ownDeletedBubble: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  otherDeletedBubble: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  deletedText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: COLORS.textSecondary,
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  systemBubble: {
    backgroundColor: 'rgba(255, 255, 220, 0.9)',
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  systemText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  // Image message styles
  imageBubble: {
    padding: 4,
    overflow: 'hidden',
  },
  messageImage: {
    borderRadius: 6,
    backgroundColor: COLORS.border,
  },
  videoContainer: {
    position: 'relative' as const,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 4,
  },
  videoDurationBadge: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  videoDurationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  imageMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 2,
  },
  ownImageMeta: {
    justifyContent: 'flex-end',
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: screenWidth,
    height: screenHeight * 0.8,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2,
  },
  // Reply preview styles
  replyPreview: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 6,
    marginBottom: SPACING.xs,
    overflow: 'hidden',
  },
  ownReplyPreview: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  replyBar: {
    width: 3,
    backgroundColor: COLORS.primaryLight,
  },
  ownReplyBar: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  replyContent: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  replyName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primaryLight,
    marginBottom: 1,
  },
  ownReplyName: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  replyText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  ownReplyText: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  // Reactions styles
  reactionsContainer: {
    position: 'absolute',
    bottom: -12,
    left: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  reactionBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  userReacted: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(37, 211, 102, 0.1)',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 2,
    fontWeight: '500',
  },
  // Edited indicator styles
  editedIndicator: {
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.45)',
    fontStyle: 'italic',
    marginRight: 4,
  },
  ownEditedIndicator: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  // Visible "..." action menu trigger (Apple Guideline 1.2 — Report/Block discoverability)
  moreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  moreButtonOwn: {
    marginRight: SPACING.xs,
  },
  moreButtonOther: {
    marginLeft: SPACING.xs,
  },
  moreButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textLight,
    lineHeight: 18,
    marginTop: -2,
  },
  // Action menu styles
  actionMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionMenuContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  actionMenuIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  actionMenuText: {
    fontSize: 16,
    color: COLORS.text,
  },
  actionMenuDeleteText: {
    color: '#FF3B30',
  },
  // Edit modal styles
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.md,
  },
  editModalContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  editInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
    minHeight: 80,
    maxHeight: 200,
    textAlignVertical: 'top',
  },
  editModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACING.md,
    gap: 12,
  },
  editModalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  editModalCancelButton: {
    backgroundColor: COLORS.border,
  },
  editModalSaveButton: {
    backgroundColor: COLORS.primary,
  },
  editModalButtonDisabled: {
    opacity: 0.5,
  },
  editModalCancelText: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  editModalSaveText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '500',
  },
  editModalHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Voice note styles
  voiceNoteContainer: {
    minWidth: 200,
  },
  voiceMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  ownVoiceMeta: {
    justifyContent: 'flex-end',
  },
  // Pin duration modal styles
  pinDurationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pinDurationContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  pinDurationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pinDurationTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  pinDurationCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinDurationCloseText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  pinDurationSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  pinDurationOptions: {
    paddingHorizontal: SPACING.md,
  },
  pinDurationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    marginVertical: 4,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  pinDurationOptionDisabled: {
    opacity: 0.5,
  },
  pinDurationOptionContent: {
    flex: 1,
  },
  pinDurationOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  pinDurationOptionDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  pinDurationOptionArrow: {
    fontSize: 24,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  pinDurationLoading: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    paddingVertical: SPACING.md,
    fontStyle: 'italic',
  },
});
