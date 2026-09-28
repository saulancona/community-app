import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
  ActivityIndicator,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import { Audio } from 'expo-av';
import { COLORS, SPACING } from '../../constants/config';
import { MentionPicker } from './MentionPicker';

// Simple user type for mentions
interface MentionUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

// Common emoji categories
const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥'],
  'Gestures': ['👍', '👎', '👌', '🤌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏', '🙌', '🤝', '🙏', '💪', '🦾', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗'],
  'Objects': ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '⭐', '🌟', '✨', '💫', '🔥', '💯', '✅', '❌', '❓', '❗', '💬', '💭', '🗯️', '💤', '💢', '💥', '💦', '💨', '🕐', '⏰', '📱', '💻', '🎵', '🎶', '🔔', '📣', '📢', '🔊', '🔇', '🔈', '🔉', '📷'],
  'Nature': ['🌸', '🌺', '🌻', '🌹', '🌷', '💐', '🌿', '🍀', '🌴', '🌵', '🌾', '🌱', '🪴', '☀️', '🌙', '⭐', '🌈', '☁️', '⛅', '🌤️', '🌧️', '⛈️', '🌩️', '❄️', '💧', '🌊', '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🦁', '🐯', '🐮', '🐷', '🐸', '🐵'],
  'Food': ['🍕', '🍔', '🍟', '🌭', '🍿', '🧂', '🥓', '🥚', '🍳', '🧇', '🥞', '🧈', '🍞', '🥐', '🥨', '🧀', '🥗', '🥙', '🥪', '🌮', '🌯', '🫔', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🍡', '🍧', '🍨', '🍦'],
};

// Emoji search keywords mapping
const EMOJI_KEYWORDS: Record<string, string[]> = {
  '😀': ['grin', 'happy', 'smile'], '😃': ['happy', 'smile', 'joy'], '😄': ['laugh', 'happy', 'smile'],
  '😁': ['grin', 'happy', 'beam'], '😅': ['sweat', 'nervous', 'laugh'], '😂': ['cry', 'laugh', 'tears', 'joy'],
  '🤣': ['rofl', 'laugh', 'rolling'], '😊': ['blush', 'happy', 'smile'], '😇': ['angel', 'innocent', 'halo'],
  '🙂': ['smile', 'slight'], '🙃': ['upside', 'sarcastic'], '😉': ['wink'],
  '😌': ['relieved', 'calm', 'peaceful'], '😍': ['love', 'heart', 'eyes'], '🥰': ['love', 'hearts', 'adore'],
  '😘': ['kiss', 'love', 'blow'], '😗': ['kiss', 'whistle'], '😙': ['kiss', 'smile'],
  '😚': ['kiss', 'blush'], '😋': ['yum', 'delicious', 'tongue'], '😛': ['tongue', 'playful'],
  '😜': ['wink', 'tongue', 'crazy'], '🤪': ['crazy', 'wild', 'zany'], '😝': ['tongue', 'squint'],
  '🤑': ['money', 'rich', 'dollar'], '🤗': ['hug', 'embrace'], '🤭': ['oops', 'giggle'],
  '🤫': ['shush', 'quiet', 'secret'], '🤔': ['think', 'hmm', 'wonder'], '🤐': ['zip', 'quiet', 'mouth'],
  '🤨': ['raised', 'eyebrow', 'skeptical'], '😐': ['neutral', 'blank'], '😑': ['expressionless'],
  '😶': ['speechless', 'silent', 'mute'], '😏': ['smirk'], '😒': ['unamused', 'meh'],
  '🙄': ['eye', 'roll', 'whatever'], '😬': ['grimace', 'awkward'], '🤥': ['lie', 'pinocchio'],
  '👍': ['thumbs', 'up', 'yes', 'good', 'like', 'ok'], '👎': ['thumbs', 'down', 'no', 'bad', 'dislike'],
  '👌': ['ok', 'perfect', 'fine'], '🤌': ['pinch', 'italian'], '✌️': ['peace', 'victory'],
  '🤞': ['cross', 'fingers', 'luck'], '🤟': ['love', 'rock'], '🤘': ['rock', 'metal'],
  '🤙': ['call', 'hang', 'loose', 'shaka'], '👈': ['left', 'point'], '👉': ['right', 'point'],
  '👆': ['up', 'point'], '👇': ['down', 'point'], '☝️': ['point', 'up'],
  '👋': ['wave', 'hello', 'hi', 'bye'], '🤚': ['stop', 'hand'], '🖐️': ['hand', 'five'],
  '✋': ['high', 'five', 'stop', 'hand'], '🖖': ['vulcan', 'spock'], '👏': ['clap', 'applause', 'bravo'],
  '🙌': ['raise', 'hands', 'celebrate', 'hooray'], '🤝': ['handshake', 'deal', 'agree'],
  '🙏': ['pray', 'please', 'thanks', 'namaste'], '💪': ['strong', 'muscle', 'flex', 'bicep'],
  '🦾': ['robot', 'arm', 'prosthetic'],
  '❤️': ['heart', 'love', 'red'], '🧡': ['heart', 'orange'], '💛': ['heart', 'yellow'],
  '💚': ['heart', 'green'], '💙': ['heart', 'blue'], '💜': ['heart', 'purple'],
  '🖤': ['heart', 'black'], '🤍': ['heart', 'white'], '🤎': ['heart', 'brown'],
  '💔': ['broken', 'heart', 'sad'], '❣️': ['heart', 'exclamation'], '💕': ['hearts', 'two', 'love'],
  '💞': ['hearts', 'revolving'], '💓': ['heart', 'beat'], '💗': ['heart', 'growing'],
  '🎉': ['party', 'celebrate', 'tada', 'congratulations'], '🎊': ['confetti', 'celebrate'],
  '🎈': ['balloon', 'party'], '🎁': ['gift', 'present', 'birthday'],
  '🏆': ['trophy', 'winner', 'champion'], '🥇': ['gold', 'medal', 'first'],
  '🥈': ['silver', 'medal', 'second'], '🥉': ['bronze', 'medal', 'third'],
  '⭐': ['star', 'favorite'], '🌟': ['star', 'glow', 'sparkle'], '✨': ['sparkle', 'magic', 'manifest'],
  '💫': ['dizzy', 'star'], '🔥': ['fire', 'hot', 'lit'], '💯': ['hundred', 'perfect', 'score'],
  '✅': ['check', 'yes', 'done', 'correct'], '❌': ['cross', 'no', 'wrong'],
  '❓': ['question'], '❗': ['exclamation', 'alert'],
  '💬': ['speech', 'chat', 'message'], '💭': ['thought', 'think'],
  '🌸': ['cherry', 'blossom', 'flower', 'spring'], '🌺': ['hibiscus', 'flower'],
  '🌻': ['sunflower'], '🌹': ['rose', 'flower', 'love'], '🌷': ['tulip', 'flower'],
  '💐': ['bouquet', 'flowers'], '🌿': ['herb', 'plant', 'green'],
  '🍀': ['clover', 'luck', 'four'], '🌴': ['palm', 'tree', 'tropical'],
  '☀️': ['sun', 'sunny', 'bright'], '🌙': ['moon', 'night', 'crescent'],
  '🌈': ['rainbow', 'pride'], '🐶': ['dog', 'puppy'], '🐱': ['cat', 'kitten'],
  '🦁': ['lion', 'king'], '🐯': ['tiger'], '🦋': ['butterfly'],
  '🍕': ['pizza'], '🍔': ['burger', 'hamburger'], '🍟': ['fries', 'french'],
  '🍿': ['popcorn', 'movie'], '🧀': ['cheese'], '🍣': ['sushi'],
  '🍦': ['ice', 'cream', 'dessert'], '🍰': ['cake', 'dessert'],
};

interface MessageInputProps {
  onSend: (message: string) => void;
  onSendImage?: () => void;
  onSendVoiceNote?: (audioData: string | Blob, duration: number) => Promise<void>;
  isUploadingImage?: boolean;
  disabled?: boolean;
  onTyping?: () => void;
  chatLocked?: boolean;
  canSendMessages?: boolean;
  isAdmin?: boolean;
  onCreatePoll?: () => void;
  members?: MentionUser[];
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  onSendImage,
  onSendVoiceNote,
  isUploadingImage = false,
  disabled = false,
  onTyping,
  chatLocked = false,
  canSendMessages = true,
  isAdmin = false,
  onCreatePoll,
  members = [],
}) => {
  const [message, setMessage] = useState('');
  const [showFormatting, setShowFormatting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState('Smileys');
  const [emojiSearch, setEmojiSearch] = useState('');
  const inputRef = useRef<TextInput>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  // Mention picker state
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingAnimation = useRef(new Animated.Value(1)).current;

  // Web-specific recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const webStreamRef = useRef<MediaStream | null>(null);

  // Audio file upload state (web only)
  const [isUploadingAudioFile, setIsUploadingAudioFile] = useState(false);

  // Read duration of an audio Blob via a temporary HTMLAudioElement.
  // Resolves with duration in ms, or 0 if metadata can't be parsed.
  const readAudioDurationMs = (blob: Blob): Promise<number> =>
    new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(blob);
        const el = new window.Audio();
        el.preload = 'metadata';
        const cleanup = () => URL.revokeObjectURL(url);
        el.onloadedmetadata = () => {
          const ms = isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 0;
          cleanup();
          resolve(ms);
        };
        el.onerror = () => {
          cleanup();
          resolve(0);
        };
        el.src = url;
      } catch {
        resolve(0);
      }
    });

  // Send a pasted/picked audio File through the existing onSendVoiceNote flow.
  // Centralized so the file picker AND the document paste handler share one path.
  const sendAudioFile = useCallback(async (file: File) => {
    console.log('[Audio] sendAudioFile called', {
      name: file.name,
      type: file.type,
      size: file.size,
      hasOnSendVoiceNote: !!onSendVoiceNote,
    });
    if (!onSendVoiceNote) {
      window.alert('Audio sending is not available in this room.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      window.alert('Audio file is too large. Please choose a file under 10MB.');
      return;
    }
    setIsUploadingAudioFile(true);
    try {
      console.log('[Audio] reading duration...');
      const durationMs = await readAudioDurationMs(file);
      console.log('[Audio] duration ms:', durationMs);
      console.log('[Audio] calling onSendVoiceNote...');
      await onSendVoiceNote(file, durationMs);
      console.log('[Audio] SENT successfully');
    } catch (err: any) {
      console.error('[Audio] FAILED:', err);
      const code = err?.code ? ` [${err.code}]` : '';
      const msg = err?.message ? `\n\n${err.message}` : '';
      window.alert(`Could not send audio file${code}.${msg}`);
    } finally {
      setIsUploadingAudioFile(false);
    }
  }, [onSendVoiceNote]);

  // Listen for clipboard pastes globally on web. If the clipboard contains an
  // audio file, intercept it and send via the voice-note pipeline. Other paste
  // types (text, images) fall through to default behavior.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;
    if (!onSendVoiceNote) return;

    const handlePaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      const audioFile = Array.from(files).find((f) =>
        (f.type && f.type.startsWith('audio/')) || /\.(mp3|m4a|wav|aac|ogg|webm|flac|aiff)$/i.test(f.name)
      );
      if (!audioFile) return;
      e.preventDefault();
      sendAudioFile(audioFile);
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onSendVoiceNote, sendAudioFile]);

  // Open the OS file picker for an audio file. Builds the input element on
  // demand to avoid react-native-web ref-binding quirks with raw <input>
  // elements rendered inside <View>.
  const openAudioFilePicker = () => {
    console.log('[Audio] picker tapped', {
      platform: Platform.OS,
      hasDocument: typeof document !== 'undefined',
      hasOnSendVoiceNote: !!onSendVoiceNote,
    });
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;
    if (!onSendVoiceNote) {
      window.alert('Audio sending is not available in this room.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.style.display = 'none';

    input.onchange = async () => {
      const file = input.files && input.files[0];
      console.log('[Audio] picker onchange', { hasFile: !!file });
      try { input.remove(); } catch { /* no-op */ }
      if (file) await sendAudioFile(file);
    };

    document.body.appendChild(input);
    input.click();
    console.log('[Audio] picker.click() called');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (Platform.OS === 'web') {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        if (webStreamRef.current) {
          webStreamRef.current.getTracks().forEach(track => track.stop());
        }
      } else if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, [recording]);

  // Recording pulse animation
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingAnimation, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(recordingAnimation, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      recordingAnimation.setValue(1);
    }
  }, [isRecording, recordingAnimation]);

  // Apply formatting to selected text or insert formatting markers
  const applyFormat = (prefix: string, suffix: string) => {
    const { start, end } = selection;
    const beforeText = message.substring(0, start);
    const selectedText = message.substring(start, end);
    const afterText = message.substring(end);

    if (start === end) {
      // No selection - insert markers and place cursor between them
      const newText = beforeText + prefix + suffix + afterText;
      setMessage(newText);
      // Focus and set cursor position after prefix
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      // Wrap selected text
      const newText = beforeText + prefix + selectedText + suffix + afterText;
      setMessage(newText);
    }
  };

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
      setShowEmojiPicker(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const { start, end } = selection;
    const newMessage = message.substring(0, start) + emoji + message.substring(end);
    setMessage(newMessage);
    // Update selection to be after inserted emoji
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Handle text change and detect @ mentions
  const handleTextChange = (text: string) => {
    setMessage(text);
    if (onTyping && text.length > 0) {
      onTyping();
    }

    // Check for @ mention trigger - scan backward from end of text
    // Find the last @ that could be an active mention (not followed by space before end)
    let atIndex = -1;
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === '@') {
        // Found @, check if it's at start of word (preceded by space, newline, or at start)
        const charBefore = i > 0 ? text[i - 1] : ' ';
        if (charBefore === ' ' || charBefore === '\n' || i === 0) {
          atIndex = i;
        }
        break;
      }
      // Stop if we hit a space or newline (mention is complete/cancelled)
      if (text[i] === ' ' || text[i] === '\n') {
        break;
      }
    }

    if (atIndex !== -1 && members.length > 0) {
      // Get the filter text after @ (everything from @ to end of text)
      const filterText = text.substring(atIndex + 1);
      setMentionStartIndex(atIndex);
      setMentionFilter(filterText);
      setShowMentionPicker(true);
      setShowEmojiPicker(false);
    } else {
      setShowMentionPicker(false);
      setMentionFilter('');
      setMentionStartIndex(-1);
    }
  };

  // Handle member selection from mention picker
  const handleMentionSelect = (member: MentionUser) => {
    if (mentionStartIndex === -1) return;

    // Replace @filter with @displayName
    const beforeMention = message.substring(0, mentionStartIndex);
    const afterMention = message.substring(mentionStartIndex + 1 + mentionFilter.length);
    const newMessage = beforeMention + '@' + member.displayName + ' ' + afterMention;

    setMessage(newMessage);
    setShowMentionPicker(false);
    setMentionFilter('');
    setMentionStartIndex(-1);

    // Focus back on input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    // Web platform - use MediaRecorder API
    if (Platform.OS === 'web') {
      try {
        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        webStreamRef.current = stream;
        audioChunksRef.current = [];

        // Create MediaRecorder with webm format (widely supported)
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100); // Collect data every 100ms

        setIsRecording(true);
        setRecordingDuration(0);

        // Start duration timer
        recordingTimerRef.current = setInterval(() => {
          setRecordingDuration((prev) => prev + 1);
        }, 1000);
      } catch (error) {
        console.error('Failed to start web recording:', error);
        window.alert('Could not access microphone. Please allow microphone access and try again.');
      }
      return;
    }

    // Native platform - use expo-av
    try {
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission to access microphone was denied');
        return;
      }

      // Configure audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const cancelRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    // Web platform cleanup
    if (Platform.OS === 'web') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (webStreamRef.current) {
        webStreamRef.current.getTracks().forEach(track => track.stop());
        webStreamRef.current = null;
      }
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    } else if (recording) {
      // Native platform cleanup
      try {
        await recording.stopAndUnloadAsync();
      } catch (error) {
        console.error('Error stopping recording:', error);
      }
      setRecording(null);
    }

    setIsRecording(false);
    setRecordingDuration(0);
  };

  const sendRecording = async () => {
    if (!onSendVoiceNote) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setIsSendingVoice(true);

    // Web platform - handle MediaRecorder
    if (Platform.OS === 'web') {
      if (!mediaRecorderRef.current) {
        setIsSendingVoice(false);
        return;
      }

      try {
        // Stop recording and wait for final data
        await new Promise<void>((resolve) => {
          if (mediaRecorderRef.current) {
            mediaRecorderRef.current.onstop = () => resolve();
            mediaRecorderRef.current.stop();
          } else {
            resolve();
          }
        });

        // Stop the media stream
        if (webStreamRef.current) {
          webStreamRef.current.getTracks().forEach(track => track.stop());
          webStreamRef.current = null;
        }

        // Create blob from chunks and pass directly (no URL conversion needed)
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const duration = recordingDuration * 1000;

        // Pass blob directly to avoid URL conversion overhead
        await onSendVoiceNote(audioBlob, duration);
      } catch (error) {
        console.error('Error sending web voice note:', error);
        window.alert('Failed to send voice note. Please try again.');
      } finally {
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        setIsRecording(false);
        setRecordingDuration(0);
        setIsSendingVoice(false);
      }
      return;
    }

    // Native platform - handle expo-av
    if (!recording) {
      setIsSendingVoice(false);
      return;
    }

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      const status = await recording.getStatusAsync();
      const duration = status.durationMillis || recordingDuration * 1000;

      if (uri) {
        await onSendVoiceNote(uri, duration);
      }
    } catch (error) {
      console.error('Error sending voice note:', error);
    } finally {
      setRecording(null);
      setIsRecording(false);
      setRecordingDuration(0);
      setIsSendingVoice(false);
    }
  };

  const hasText = message.trim().length > 0;
  const isInputDisabled = disabled || (chatLocked && !canSendMessages);

  // Show locked message when user can't send
  if (chatLocked && !canSendMessages) {
    return (
      <View style={styles.lockedContainer}>
        <View style={styles.lockedContent}>
          <LockIcon color={COLORS.textSecondary} />
          <Text style={styles.lockedText}>Chat is currently locked by admin</Text>
        </View>
      </View>
    );
  }

  // Recording UI
  if (isRecording) {
    return (
      <View style={styles.recordingContainer}>
        <TouchableOpacity
          style={styles.cancelRecordingButton}
          onPress={cancelRecording}
          accessibilityRole="button"
          accessibilityLabel="Cancel recording"
        >
          <TrashIcon color={COLORS.error} />
        </TouchableOpacity>

        <View style={styles.recordingInfo}>
          <Animated.View
            style={[
              styles.recordingIndicator,
              { transform: [{ scale: recordingAnimation }] },
            ]}
          />
          <Text style={styles.recordingTime}>{formatDuration(recordingDuration)}</Text>
          <Text style={styles.recordingLabel}>Recording...</Text>
        </View>

        <TouchableOpacity
          style={styles.sendRecordingButton}
          onPress={sendRecording}
          disabled={isSendingVoice}
          accessibilityRole="button"
          accessibilityLabel="Send voice note"
        >
          {isSendingVoice ? (
            <ActivityIndicator size="small" color={COLORS.surface} />
          ) : (
            <SendIcon color={COLORS.surface} />
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Mention Picker - shows when user types @ */}
      <MentionPicker
        visible={showMentionPicker}
        members={members}
        filter={mentionFilter}
        onSelect={handleMentionSelect}
        onClose={() => {
          setShowMentionPicker(false);
          setMentionFilter('');
          setMentionStartIndex(-1);
        }}
      />

      {/* Emoji Picker - inline instead of modal */}
      {showEmojiPicker && (
        <View style={styles.emojiPickerContainer}>
          {/* Header with search and close */}
          <View style={styles.emojiPickerHeader}>
            <View style={styles.emojiSearchContainer}>
              <Text style={styles.emojiSearchIcon}>🔍</Text>
              <TextInput
                style={styles.emojiSearchInput}
                placeholder="Search emojis..."
                placeholderTextColor={COLORS.textLight}
                value={emojiSearch}
                onChangeText={(text) => setEmojiSearch(text)}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {emojiSearch.length > 0 && (
                <TouchableOpacity onPress={() => setEmojiSearch('')}>
                  <Text style={styles.emojiSearchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => { setShowEmojiPicker(false); setEmojiSearch(''); }}
              accessibilityRole="button"
              accessibilityLabel="Close emoji picker"
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Category tabs - hidden during search */}
          {!emojiSearch && (
            <View style={styles.emojiCategoryTabsContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.emojiCategoryTabsContent}
              >
                {Object.keys(EMOJI_CATEGORIES).map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.emojiCategoryTab,
                      selectedEmojiCategory === category && styles.emojiCategoryTabActive,
                    ]}
                    onPress={() => setSelectedEmojiCategory(category)}
                  >
                    <Text
                      style={[
                        styles.emojiCategoryTabText,
                        selectedEmojiCategory === category && styles.emojiCategoryTabTextActive,
                      ]}
                    >
                      {category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Emoji grid */}
          <ScrollView style={styles.emojiGrid} contentContainerStyle={styles.emojiGridPadding}>
            <View style={styles.emojiGridContent}>
              {emojiSearch ? (
                // Search results - search across all categories
                Object.values(EMOJI_CATEGORIES).flat().filter((emoji) => {
                  const keywords = EMOJI_KEYWORDS[emoji] || [];
                  const search = emojiSearch.toLowerCase();
                  return keywords.some(kw => kw.includes(search));
                }).map((emoji, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.emojiButton}
                    onPress={() => handleEmojiSelect(emoji)}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                // Category view
                EMOJI_CATEGORIES[selectedEmojiCategory as keyof typeof EMOJI_CATEGORIES].map(
                  (emoji, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.emojiButton}
                      onPress={() => handleEmojiSelect(emoji)}
                    >
                      <Text style={styles.emoji}>{emoji}</Text>
                    </TouchableOpacity>
                  )
                )
              )}
            </View>
            {emojiSearch && Object.values(EMOJI_CATEGORIES).flat().filter((emoji) => {
              const keywords = EMOJI_KEYWORDS[emoji] || [];
              return keywords.some(kw => kw.includes(emojiSearch.toLowerCase()));
            }).length === 0 && (
              <Text style={styles.emojiNoResults}>No emojis found</Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* Formatting Toolbar */}
      {showFormatting && (
        <View style={styles.formattingToolbar} accessibilityRole="toolbar" accessibilityLabel="Text formatting options">
          <TouchableOpacity
            style={styles.formatButton}
            onPress={() => applyFormat('**', '**')}
            accessibilityRole="button"
            accessibilityLabel="Bold"
            accessibilityHint="Apply bold formatting to selected text"
          >
            <Text style={styles.formatButtonTextBold}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.formatButton}
            onPress={() => applyFormat('*', '*')}
            accessibilityRole="button"
            accessibilityLabel="Italic"
            accessibilityHint="Apply italic formatting to selected text"
          >
            <Text style={styles.formatButtonTextItalic}>I</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.formatButton}
            onPress={() => applyFormat('~~', '~~')}
            accessibilityRole="button"
            accessibilityLabel="Strikethrough"
            accessibilityHint="Apply strikethrough formatting to selected text"
          >
            <Text style={styles.formatButtonTextStrike}>S</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.formatButton}
            onPress={() => applyFormat('`', '`')}
            accessibilityRole="button"
            accessibilityLabel="Code"
            accessibilityHint="Apply monospace code formatting to selected text"
          >
            <Text style={styles.formatButtonTextMono}>{'</>'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.formatButton}
            onPress={() => applyFormat('***', '***')}
            accessibilityRole="button"
            accessibilityLabel="Bold and Italic"
            accessibilityHint="Apply bold and italic formatting to selected text"
          >
            <Text style={styles.formatButtonTextBoldItalic}>BI</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.container}>
        {/* Emoji button */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setShowEmojiPicker(!showEmojiPicker)}
          accessibilityRole="button"
          accessibilityLabel="Open emoji picker"
        >
          <EmojiIcon color={showEmojiPicker ? COLORS.primary : COLORS.textSecondary} />
        </TouchableOpacity>

        {/* Format toggle button */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setShowFormatting(!showFormatting)}
          accessibilityRole="button"
          accessibilityLabel={showFormatting ? 'Hide text formatting options' : 'Show text formatting options'}
          accessibilityState={{ expanded: showFormatting }}
        >
          <FormatIcon color={showFormatting ? COLORS.primary : COLORS.textSecondary} />
        </TouchableOpacity>

        {/* Poll button (admin only) */}
        {isAdmin && onCreatePoll && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onCreatePoll}
            accessibilityRole="button"
            accessibilityLabel="Create poll"
            accessibilityHint="Create a new poll for members to vote on"
          >
            <PollIcon color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}

        {/* Input field */}
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Message"
            placeholderTextColor={COLORS.textLight}
            value={message}
            onChangeText={handleTextChange}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            onKeyPress={(e) => {
              // Enter sends message (desktop only, Shift+Enter inserts newline).
              // Skip on mobile — touch keyboards fire synthetic Enter events
              // from autocorrect / predictive text, which caused messages to be
              // sent in the middle of typing.
              if (Platform.OS !== 'web') return;
              const native = e.nativeEvent as any;
              if (native.key !== 'Enter') return;
              if (native.shiftKey) return;
              // Skip during IME composition (autocorrect, suggestions, etc.)
              if (native.isComposing || native.keyCode === 229) return;
              // Skip on touch devices — no physical keyboard
              if (typeof window !== 'undefined' && 'ontouchstart' in window) return;
              e.preventDefault();
              handleSend();
            }}
            multiline
            maxLength={5000}
            editable={!disabled}
            accessibilityLabel="Message input"
            accessibilityHint="Type your message here"
          />
          {/* Audio file attach button (web only) */}
          {Platform.OS === 'web' && onSendVoiceNote && (
            <TouchableOpacity
              style={styles.cameraButton}
              onPress={openAudioFilePicker}
              disabled={isUploadingAudioFile || disabled}
              accessibilityRole="button"
              accessibilityLabel="Attach audio file"
              accessibilityHint="Select an audio file from your device to send"
              accessibilityState={{ disabled: isUploadingAudioFile || disabled }}
            >
              {isUploadingAudioFile ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <AudioAttachIcon color={COLORS.textSecondary} />
              )}
            </TouchableOpacity>
          )}
          {/* Camera/Image button inside input */}
          <TouchableOpacity
            style={styles.cameraButton}
            onPress={onSendImage}
            disabled={isUploadingImage || disabled}
            accessibilityRole="button"
            accessibilityLabel="Send image"
            accessibilityHint="Select an image from your device to send"
            accessibilityState={{ disabled: isUploadingImage || disabled }}
          >
            {isUploadingImage ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <CameraIcon color={COLORS.textSecondary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Send/Voice button */}
        <TouchableOpacity
          style={styles.sendButton}
          onPress={hasText ? handleSend : startRecording}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={hasText ? 'Send message' : 'Record voice message'}
          accessibilityHint={hasText ? 'Tap to send your message' : 'Tap to start recording a voice message'}
          accessibilityState={{ disabled }}
        >
          {hasText ? (
            <SendIcon color={COLORS.surface} />
          ) : (
            <MicIcon color={COLORS.surface} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// Emoji icon
const EmojiIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.emojiContainer}>
    <View style={[iconStyles.emojiCircle, { borderColor: color }]}>
      <View style={iconStyles.emojiEyes}>
        <View style={[iconStyles.emojiEye, { backgroundColor: color }]} />
        <View style={[iconStyles.emojiEye, { backgroundColor: color }]} />
      </View>
      <View style={[iconStyles.emojiSmile, { borderColor: color }]} />
    </View>
  </View>
);

// Camera icon
const CameraIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.cameraContainer}>
    <View style={[iconStyles.cameraBody, { borderColor: color }]}>
      <View style={[iconStyles.cameraLens, { borderColor: color }]} />
    </View>
  </View>
);

// Audio-attach icon (musical note glyph) for uploading audio files
const AudioAttachIcon: React.FC<{ color: string }> = ({ color }) => (
  <Text style={{ fontSize: 18, color, lineHeight: 22 }}>🎵</Text>
);

// Send arrow icon
const SendIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.sendContainer}>
    <View style={[iconStyles.sendArrow, { borderLeftColor: color }]} />
  </View>
);

// Microphone icon
const MicIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.micContainer}>
    <View style={[iconStyles.micHead, { backgroundColor: color }]} />
    <View style={[iconStyles.micStand, { borderColor: color }]} />
    <View style={[iconStyles.micBase, { backgroundColor: color }]} />
  </View>
);

// Format icon (Aa style)
const FormatIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.formatContainer}>
    <Text style={[iconStyles.formatText, { color }]}>Aa</Text>
  </View>
);

// Poll icon (chart bars style)
const PollIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.pollContainer}>
    <View style={[iconStyles.pollBar1, { backgroundColor: color }]} />
    <View style={[iconStyles.pollBar2, { backgroundColor: color }]} />
    <View style={[iconStyles.pollBar3, { backgroundColor: color }]} />
  </View>
);

// Lock icon
const LockIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.lockContainer}>
    <View style={[iconStyles.lockShackle, { borderColor: color }]} />
    <View style={[iconStyles.lockBody, { backgroundColor: color }]}>
      <View style={iconStyles.lockKeyhole} />
    </View>
  </View>
);

// Trash icon for cancel recording
const TrashIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={iconStyles.trashContainer}>
    <View style={[iconStyles.trashLid, { backgroundColor: color }]} />
    <View style={[iconStyles.trashBody, { borderColor: color }]} />
  </View>
);

const styles = StyleSheet.create({
  lockedContainer: {
    backgroundColor: COLORS.chatBackground,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  lockedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 20,
  },
  lockedText: {
    marginLeft: SPACING.sm,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  formattingToolbar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'flex-start',
    gap: SPACING.sm,
  },
  formatButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formatButtonTextBold: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  formatButtonTextItalic: {
    fontSize: 16,
    fontStyle: 'italic',
    color: COLORS.text,
  },
  formatButtonTextStrike: {
    fontSize: 16,
    textDecorationLine: 'line-through',
    color: COLORS.text,
  },
  formatButtonTextMono: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: COLORS.text,
  },
  formatButtonTextBoldItalic: {
    fontSize: 14,
    fontWeight: 'bold',
    fontStyle: 'italic',
    color: COLORS.text,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.chatBackground,
    ...Platform.select({
      web: {
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.05)',
      },
    }),
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.sm,
    paddingVertical: Platform.OS === 'ios' ? SPACING.sm : 0,
    marginHorizontal: SPACING.sm,
    minHeight: 52,
    maxHeight: 120,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 1px 6px rgba(0, 0, 0, 0.08)',
      },
    }),
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    maxHeight: 100,
    minHeight: 24,
    paddingVertical: Platform.OS === 'ios' ? 0 : SPACING.sm,
  },
  cameraButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.lightGreen,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: COLORS.lightGreen,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 2px 8px rgba(74, 222, 128, 0.4)',
      },
    }),
  },
  // Recording styles
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.chatBackground,
  },
  cancelRecordingButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.error,
    marginRight: SPACING.sm,
  },
  recordingTime: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: SPACING.sm,
  },
  recordingLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  sendRecordingButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.lightGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Emoji picker styles
  emojiPickerContainer: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    height: 380,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  emojiPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  emojiSearchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 20,
    paddingHorizontal: SPACING.sm,
    height: 36,
  },
  emojiSearchIcon: {
    fontSize: 14,
    marginRight: SPACING.xs,
  },
  emojiSearchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 0,
    height: 36,
  },
  emojiSearchClear: {
    fontSize: 16,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.xs,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: COLORS.text,
    fontWeight: '600',
    lineHeight: 20,
  },
  emojiCategoryTabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#f5f5f5',
  },
  emojiCategoryTabsContent: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  emojiCategoryTab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginRight: SPACING.xs,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#999',
    backgroundColor: '#fff',
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiCategoryTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  emojiCategoryTabText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
    lineHeight: 16,
  },
  emojiCategoryTabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  emojiGrid: {
    flex: 1,
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  emojiGridPadding: {
    paddingBottom: SPACING.md,
  },
  emojiGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emojiNoResults: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
    paddingVertical: SPACING.lg,
  },
  emojiButton: {
    width: '12.5%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 26,
  },
});

const iconStyles = StyleSheet.create({
  // Emoji icon styles
  emojiContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiEyes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 10,
    marginTop: -2,
  },
  emojiEye: {
    width: 2,
    height: 3,
    borderRadius: 1,
  },
  emojiSmile: {
    width: 8,
    height: 4,
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    marginTop: 1,
  },
  // Camera icon styles
  cameraContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBody: {
    width: 18,
    height: 14,
    borderWidth: 2,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraLens: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 2,
  },
  // Send icon styles
  sendContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendArrow: {
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 14,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: 4,
  },
  // Mic icon styles
  micContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micHead: {
    width: 8,
    height: 12,
    borderRadius: 4,
    marginBottom: -2,
  },
  micStand: {
    width: 12,
    height: 6,
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  micBase: {
    width: 2,
    height: 4,
    marginTop: -1,
  },
  // Format icon styles
  formatContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formatText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Poll icon styles
  pollContainer: {
    width: 24,
    height: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 2,
  },
  pollBar1: {
    width: 5,
    height: 8,
    borderRadius: 1,
  },
  pollBar2: {
    width: 5,
    height: 14,
    borderRadius: 1,
  },
  pollBar3: {
    width: 5,
    height: 11,
    borderRadius: 1,
  },
  // Lock icon styles
  lockContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockShackle: {
    width: 10,
    height: 8,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    marginBottom: -2,
  },
  lockBody: {
    width: 14,
    height: 10,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockKeyhole: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.chatBackground,
  },
  // Trash icon styles
  trashContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trashLid: {
    width: 16,
    height: 2,
    borderRadius: 1,
    marginBottom: 1,
  },
  trashBody: {
    width: 12,
    height: 12,
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
});
