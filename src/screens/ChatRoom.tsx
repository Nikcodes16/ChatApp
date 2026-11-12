
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Linking,
  Modal,
  ActivityIndicator,
} from 'react-native';

import { RouteProp, useRoute } from '@react-navigation/native';
import {
  ArrowLeft,
  Send,
  X,
  Paperclip,
  Image as ImageIcon,
  Camera,
  FileText,
  Video,
  Music,
} from 'lucide-react-native';

import {
  launchCamera,
  launchImageLibrary,
  Asset,
} from 'react-native-image-picker';

import {
  pick,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import socket from '../services/socket';

type RootStackParamList = {
  Home: undefined;
  ChatRoom: {
    name: string;
    currentUserId: string;
    chatUserId: string;
  };
};

type ChatRoomRouteProp = RouteProp<RootStackParamList, 'ChatRoom'>;

type MessageStatus = 'sent' | 'delivered' | 'seen';

type AttachmentType =
  | 'text'
  | 'image'
  | 'video'
  | 'document'
  | 'audio';

type ReplyPreview = {
  messageId: string | null;
  text: string;
  sender: string;
};

type Message = {
  id: string;
  text: string;
  sender: 'me' | 'other';
  roomId: string;
  status: MessageStatus;
  replyTo?: ReplyPreview | null;
  isDeleted?: boolean;
  createdAt?: string;
  type?: AttachmentType;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
};

const API_URL = 'https://chatapp-6xj8.onrender.com';
const PURPLE = '#6C4AB6';
const DELETED_TEXT = 'This message was deleted';

const normalizeId = (value: unknown): string =>
  value == null ? '' : String(value).trim();

const getMessageDate = (item: any): string | undefined => {
  const value =
    item?.createdAt ??
    item?.timestamp ??
    item?.created_at ??
    item?.date;

  if (!value) return undefined;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const getDayKey = (value?: string): string => {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const getTimelineLabel = (value?: string): string => {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (getDayKey(value) === getDayKey(today.toISOString())) {
    return 'Today';
  }

  if (getDayKey(value) === getDayKey(yesterday.toISOString())) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getMessageTime = (value?: string): string => {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const sortMessages = (items: Message[]): Message[] =>
  [...items].sort((a, b) => {
    const first = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const second = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return first - second;
  });

const normalizeReply = (reply: any): ReplyPreview | null => {
  if (!reply || typeof reply !== 'object') return null;

  return {
    messageId: reply.messageId ? normalizeId(reply.messageId) : null,
    text: String(reply.text || ''),
    sender: normalizeId(reply.sender),
  };
};

const ChatRoom = ({ navigation }: any) => {
  const route = useRoute<ChatRoomRouteProp>();
  const { name, currentUserId, chatUserId } = route.params;
  const insets = useSafeAreaInsets();

  const currentId = normalizeId(currentUserId);
  const otherId = normalizeId(chatUserId);

  // Keep the same deterministic room ID used by the existing app.
  const roomId =
    currentId < otherId
      ? `${currentId}_${otherId}`
      : `${otherId}_${currentId}`;

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  const flatListRef = useRef<FlatList<Message>>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRequestRef = useRef(0);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    socket.emit('typing', {
      roomId,
      userId: currentId,
      isTyping: false,
    });
  }, [roomId, currentId]);

  const formatDatabaseMessage = useCallback(
    (item: any): Message => ({
      id: normalizeId(item?._id ?? item?.id),
      text: item?.isDeleted
        ? DELETED_TEXT
        : String(item?.text ?? ''),
      sender:
        normalizeId(item?.sender) === currentId ? 'me' : 'other',
      roomId: normalizeId(item?.roomId),
      status: item?.status || 'sent',
      replyTo: normalizeReply(item?.replyTo),
      isDeleted: Boolean(item?.isDeleted),
      createdAt: getMessageDate(item),
      type: item?.type || 'text',
      mediaUrl: item?.mediaUrl || '',
      fileName: item?.fileName || '',
      mimeType: item?.mimeType || '',
      fileSize: Number(item?.fileSize || 0),
    }),
    [currentId],
  );

  // =========================
  // LOAD CHAT HISTORY
  // =========================

  const loadMessages = useCallback(async () => {
    const requestId = ++historyRequestRef.current;

    setHistoryLoading(true);

    const url =
      `${API_URL}/messages?roomId=${encodeURIComponent(roomId)}` +
      `&userId=${encodeURIComponent(currentId)}`;

    console.log('========== CHAT HISTORY REQUEST ==========');
    console.log('CHAT USER:', name);
    console.log('CURRENT USER ID:', currentId);
    console.log('OTHER USER ID:', otherId);
    console.log('ROOM ID:', roomId);
    console.log('HISTORY URL:', url);

    try {
      const response = await fetch(url);
      const responseText = await response.text();

      console.log('CHAT HISTORY HTTP STATUS:', response.status);
      console.log('CHAT HISTORY RAW RESPONSE:', responseText);

      let data: any;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          `Server returned invalid JSON (HTTP ${response.status})`,
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.message || `History request failed: ${response.status}`,
        );
      }

      if (!Array.isArray(data)) {
        throw new Error('History API response is not an array');
      }

      const formatted = sortMessages(
        data
          .map(formatDatabaseMessage)
          .filter((item: Message) => Boolean(item.id)),
      );

      console.log('CHAT HISTORY ARRAY COUNT:', data.length);
      console.log('CHAT HISTORY FORMATTED COUNT:', formatted.length);
      console.log(
        'CHAT HISTORY ROOM IDS:',
        [...new Set(data.map((item: any) => normalizeId(item?.roomId)))],
      );

      // Ignore results from an older request if the screen was refreshed.
      if (requestId !== historyRequestRef.current) return;

      setMessages(previous => {
        // Preserve any messages received through Socket.IO while history loaded.
        const byId = new Map<string, Message>();

        formatted.forEach(item => byId.set(item.id, item));
        previous.forEach(item => {
          if (!byId.has(item.id)) {
            byId.set(item.id, item);
          }
        });

        return sortMessages(Array.from(byId.values()));
      });
    } catch (error: any) {
      console.error('========== CHAT HISTORY ERROR ==========');
      console.error('ROOM ID:', roomId);
      console.error('ERROR:', error?.message || error);

      Alert.alert(
        'Could not load chat',
        error?.message || 'Unable to load previous messages.',
      );
    } finally {
      if (requestId === historyRequestRef.current) {
        setHistoryLoading(false);
      }
    }
  }, [roomId, currentId, otherId, name, formatDatabaseMessage]);

  useEffect(() => {
    loadMessages();

    return () => {
      // Invalidate requests that finish after this screen is closed.
      historyRequestRef.current += 1;
    };
  }, [loadMessages]);

  // =========================
  // SOCKET EVENTS
  // =========================

  useEffect(() => {
    const handleConnect = () => {
      console.log('CHAT SOCKET CONNECTED');
      console.log('JOINING CHAT ROOM:', roomId);

      socket.emit('user_online', currentId);
      socket.emit('join_room', roomId);
    };

    const handleReceiveMessage = (incoming: any) => {
      if (normalizeId(incoming?.roomId) !== roomId) return;

      const id = normalizeId(incoming?.id ?? incoming?._id);
      if (!id) return;

      const formatted: Message = {
        id,
        text: incoming?.isDeleted
          ? DELETED_TEXT
          : String(incoming?.text ?? ''),
        sender:
          normalizeId(incoming?.sender) === currentId ? 'me' : 'other',
        roomId: normalizeId(incoming?.roomId),
        status: incoming?.status || 'sent',
        replyTo: normalizeReply(incoming?.replyTo),
        isDeleted: Boolean(incoming?.isDeleted),
        createdAt: getMessageDate(incoming) || new Date().toISOString(),
        type: incoming?.type || 'text',
        mediaUrl: incoming?.mediaUrl || '',
        fileName: incoming?.fileName || '',
        mimeType: incoming?.mimeType || '',
        fileSize: Number(incoming?.fileSize || 0),
      };

      setMessages(previous => {
        const existingIndex = previous.findIndex(item => item.id === id);

        if (existingIndex >= 0) {
          return sortMessages(
            previous.map(item =>
              item.id === id ? { ...item, ...formatted } : item,
            ),
          );
        }

        return sortMessages([...previous, formatted]);
      });

      if (formatted.sender === 'other') {
        socket.emit('message_delivered', id);
      }
    };

    const handleMessageSent = (saved: any) => {
      const savedId = normalizeId(saved?.id ?? saved?._id);
      if (!savedId) return;

      if (saved?.roomId && normalizeId(saved.roomId) !== roomId) {
        return;
      }

      const tempId = normalizeId(saved?.clientTempId);

      setMessages(previous => {
        const alreadySaved = previous.some(item => item.id === savedId);

        if (alreadySaved) {
          return sortMessages(
            previous.map(item =>
              item.id === savedId
                ? {
                    ...item,
                    status: saved?.status || 'sent',
                    createdAt: getMessageDate(saved) || item.createdAt,
                  }
                : item,
            ),
          );
        }

        const tempIndex = previous.findIndex(item => {
          if (!item.id.startsWith('temp_')) return false;
          if (tempId) return item.id === tempId;

          return (
            item.sender === 'me' &&
            item.roomId === roomId &&
            item.text === String(saved?.text ?? '') &&
            (item.type || 'text') === (saved?.type || 'text')
          );
        });

        if (tempIndex < 0) return previous;

        return sortMessages(
          previous.map((item, index) =>
            index === tempIndex
              ? {
                  ...item,
                  id: savedId,
                  status: saved?.status || 'sent',
                  createdAt: getMessageDate(saved) || item.createdAt,
                }
              : item,
          ),
        );
      });
    };

    const handleMessageStatus = (data: any) => {
      setMessages(previous =>
        previous.map(item =>
          item.id === normalizeId(data?.messageId)
            ? { ...item, status: data?.status }
            : item,
        ),
      );
    };

    const handleMessageDeleted = (data: any) => {
      if (normalizeId(data?.roomId) !== roomId) return;

      const id = normalizeId(data?.messageId);

      setMessages(previous =>
        previous.map(item =>
          item.id === id
            ? {
                ...item,
                text: data?.text || DELETED_TEXT,
                isDeleted: true,
              }
            : item,
        ),
      );

      setReplyingTo(previous =>
        previous && previous.id === id
          ? { ...previous, text: DELETED_TEXT, isDeleted: true }
          : previous,
      );
    };

    const handleMessageDeletedForMe = (data: any) => {
      if (
        normalizeId(data?.roomId) !== roomId ||
        normalizeId(data?.userId) !== currentId
      ) {
        return;
      }

      const id = normalizeId(data?.messageId);

      setMessages(previous => previous.filter(item => item.id !== id));

      setReplyingTo(previous =>
        previous && previous.id === id ? null : previous,
      );
    };

    const handleDeleteError = (data: any) => {
      Alert.alert(
        'Delete failed',
        data?.message || 'Could not delete this message.',
      );
    };

    const handleUserStatus = (data: any) => {
      if (normalizeId(data?.userId) === otherId) {
        setIsOnline(Boolean(data?.online));
      }
    };

    const handleOnlineUsers = (userIds: string[]) => {
      setIsOnline(
        Array.isArray(userIds) &&
          userIds.some(id => normalizeId(id) === otherId),
      );
    };

    const handleTyping = (data: any) => {
      if (
        normalizeId(data?.roomId) === roomId &&
        normalizeId(data?.userId) === otherId
      ) {
        setIsTyping(Boolean(data?.isTyping));
      }
    };

    socket.on('connect', handleConnect);
    socket.on('receive_message', handleReceiveMessage);
    socket.on('message_sent', handleMessageSent);
    socket.on('message_status', handleMessageStatus);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('message_deleted_for_me', handleMessageDeletedForMe);
    socket.on('delete_message_error', handleDeleteError);
    socket.on('user_status', handleUserStatus);
    socket.on('online_users', handleOnlineUsers);
    socket.on('user_typing', handleTyping);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('receive_message', handleReceiveMessage);
      socket.off('message_sent', handleMessageSent);
      socket.off('message_status', handleMessageStatus);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('message_deleted_for_me', handleMessageDeletedForMe);
      socket.off('delete_message_error', handleDeleteError);
      socket.off('user_status', handleUserStatus);
      socket.off('online_users', handleOnlineUsers);
      socket.off('user_typing', handleTyping);

      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }

      socket.emit('typing', {
        roomId,
        userId: currentId,
        isTyping: false,
      });
    };
  }, [roomId, currentId, otherId]);

  // =========================
  // TYPING INDICATOR
  // =========================

  const handleTypingChange = (text: string) => {
    setMessage(text);

    socket.emit('typing', {
      roomId,
      userId: currentId,
      isTyping: Boolean(text.trim()),
    });

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    if (text.trim()) {
      typingTimerRef.current = setTimeout(() => {
        socket.emit('typing', {
          roomId,
          userId: currentId,
          isTyping: false,
        });

        typingTimerRef.current = null;
      }, 1200);
    }
  };

  const makeReplyPreview = (item: Message): ReplyPreview => ({
    messageId: item.id,
    text: item.isDeleted
      ? DELETED_TEXT
      : item.text || item.fileName || 'Attachment',
    sender: item.sender === 'me' ? currentId : otherId,
  });

  const handleReply = (item: Message) => {
    if (item.id.startsWith('temp_')) {
      Alert.alert('Please wait', 'This message is still being sent.');
      return;
    }

    setReplyingTo(item);
  };

  const handleDeleteForEveryone = (item: Message) => {
    if (item.sender !== 'me' || item.id.startsWith('temp_') || item.isDeleted) {
      return;
    }

    Alert.alert(
      'Delete message?',
      'This message will be deleted for everyone in this chat.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete for everyone',
          style: 'destructive',
          onPress: () => {
            socket.emit('delete_message', {
              messageId: item.id,
              userId: currentId,
              roomId,
            });
          },
        },
      ],
    );
  };

  const handleDeleteForMe = (item: Message) => {
    if (item.id.startsWith('temp_')) return;

    Alert.alert(
      'Delete for me?',
      'This message will be removed only from your chat.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete for me',
          style: 'destructive',
          onPress: () => {
            socket.emit('delete_message_for_me', {
              messageId: item.id,
              userId: currentId,
              roomId,
            });
          },
        },
      ],
    );
  };

  const handleLongPress = (item: Message) => {
    if (item.isDeleted || item.id.startsWith('temp_')) return;

    const actions: any[] = [
      { text: 'Reply', onPress: () => handleReply(item) },
      {
        text: 'Delete for me',
        style: 'destructive',
        onPress: () => handleDeleteForMe(item),
      },
    ];

    if (item.sender === 'me') {
      actions.push({
        text: 'Delete for everyone',
        style: 'destructive',
        onPress: () => handleDeleteForEveryone(item),
      });
    }

    actions.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Message options', 'Choose an action', actions);
  };

  // =========================
  // SEND TEXT MESSAGE
  // =========================

  const sendMessage = () => {
    const text = message.trim();

    if (!text) return;

    if (!socket.connected) {
      Alert.alert(
        'Connection unavailable',
        'Please wait for the chat to reconnect.',
      );
      return;
    }

    stopTyping();

    const tempId =
      `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date().toISOString();
    const replyTo = replyingTo ? makeReplyPreview(replyingTo) : null;

    const optimisticMessage: Message = {
      id: tempId,
      text,
      sender: 'me',
      roomId,
      status: 'sent',
      replyTo,
      createdAt,
      type: 'text',
    };

    setMessages(previous => sortMessages([...previous, optimisticMessage]));

    socket.emit('send_message', {
      id: tempId,
      clientTempId: tempId,
      text,
      sender: currentId,
      receiver: otherId,
      roomId,
      replyTo,
      createdAt,
    });

    setMessage('');
    setReplyingTo(null);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // =========================
  // UPLOAD AND SEND ATTACHMENT
  // =========================

  const uploadAndSendAttachment = async (
    asset: Asset,
    forcedType?: 'image' | 'video' | 'document' | 'audio',
  ) => {
    if (!asset.uri) {
      Alert.alert('Upload failed', 'The selected file has no URI.');
      return;
    }

    if (!socket.connected) {
      Alert.alert(
        'Connection unavailable',
        'Please wait for the chat to reconnect.',
      );
      return;
    }

    setAttachmentMenuVisible(false);
    setUploadingAttachment(true);

    const mimeType = asset.type || 'application/octet-stream';

    const type: 'image' | 'video' | 'document' | 'audio' =
      forcedType ||
      (mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('video/')
          ? 'video'
          : mimeType.startsWith('audio/')
            ? 'audio'
            : 'document');

    try {
      const formData = new FormData();

      formData.append(
        'file',
        {
          uri: asset.uri,
          name: asset.fileName || `attachment_${Date.now()}`,
          type: mimeType,
        } as any,
      );

      const response = await fetch(
        `${API_URL}/upload/chat-media/${encodeURIComponent(currentId)}`,
        {
          method: 'POST',
          body: formData,
        },
      );

      const responseText = await response.text();

      console.log('Attachment upload status:', response.status);
      console.log('Attachment upload response:', responseText);

      let uploaded: any;

      try {
        uploaded = JSON.parse(responseText);
      } catch {
        throw new Error(
          `Invalid upload response (HTTP ${response.status}): ${responseText.slice(0, 200)}`,
        );
      }

      if (!response.ok) {
        throw new Error(
          uploaded?.message || `Upload failed: ${response.status}`,
        );
      }

      if (
        typeof uploaded.mediaUrl !== 'string' ||
        !uploaded.mediaUrl.trim()
      ) {
        throw new Error('The server did not return a media URL.');
      }

      const tempId =
        `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const createdAt = new Date().toISOString();
      const fileName = uploaded.fileName || asset.fileName || 'Attachment';
      const finalMimeType = uploaded.mimeType || mimeType;
      const fileSize = Number(uploaded.fileSize ?? asset.fileSize ?? 0);
      const replyTo = replyingTo ? makeReplyPreview(replyingTo) : null;

      const optimisticMessage: Message = {
        id: tempId,
        text: '',
        sender: 'me',
        roomId,
        status: 'sent',
        replyTo,
        createdAt,
        type,
        mediaUrl: uploaded.mediaUrl,
        fileName,
        mimeType: finalMimeType,
        fileSize,
      };

      setMessages(previous => sortMessages([...previous, optimisticMessage]));

      socket.emit('send_message', {
        id: tempId,
        clientTempId: tempId,
        text: '',
        sender: currentId,
        receiver: otherId,
        roomId,
        replyTo,
        type,
        mediaUrl: uploaded.mediaUrl,
        fileName,
        mimeType: finalMimeType,
        fileSize,
        createdAt,
      });

      setReplyingTo(null);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error: any) {
      console.error('Attachment upload error:', error);

      Alert.alert(
        'Attachment failed',
        error?.message || 'Could not upload the selected file.',
      );
    } finally {
      setUploadingAttachment(false);
    }
  };

  const chooseGallery = async () => {
    setAttachmentMenuVisible(false);

    try {
      const result = await launchImageLibrary({
        mediaType: 'mixed',
        selectionLimit: 1,
      });

      if (result.didCancel || !result.assets?.[0]) return;

      await uploadAndSendAttachment(result.assets[0]);
    } catch (error) {
      console.error('Gallery error:', error);
      Alert.alert('Gallery error', 'Could not open the gallery.');
    }
  };

  const takePhoto = async () => {
    setAttachmentMenuVisible(false);

    try {
      const result = await launchCamera({
        mediaType: 'photo',
        saveToPhotos: true,
      });

      if (result.didCancel || !result.assets?.[0]) return;

      await uploadAndSendAttachment(result.assets[0], 'image');
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Camera error', 'Could not open the camera.');
    }
  };

  const chooseDocument = async () => {
    setAttachmentMenuVisible(false);

    try {
      const result = await pick({ type: [types.allFiles] });
      const file = result[0];

      if (!file?.uri) return;

      const asset: Asset = {
        uri: file.uri,
        fileName: file.name || 'Document',
        type: file.type || 'application/octet-stream',
        fileSize: file.size ?? undefined,
      };

      await uploadAndSendAttachment(asset);
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return;
      }

      console.error('Document picker error:', error);
      Alert.alert('Document error', 'Could not select or upload the document.');
    }
  };

  const openAttachment = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Open attachment error:', error);
      Alert.alert('Error', 'Could not open this attachment.');
    }
  };

  // =========================
  // RENDER MESSAGE
  // =========================

  const renderMessage = ({
    item,
    index,
  }: {
    item: Message;
    index: number;
  }) => {
    const isMe = item.sender === 'me';
    const previous = messages[index - 1];

    const showDate =
      Boolean(item.createdAt) &&
      (index === 0 ||
        getDayKey(item.createdAt) !== getDayKey(previous?.createdAt));

    const replySender =
      normalizeId(item.replyTo?.sender) === currentId ? 'You' : name;

    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparatorContainer}>
            <View style={styles.dateSeparator}>
              <Text style={styles.dateSeparatorText}>
                {getTimelineLabel(item.createdAt)}
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.messageRow, isMe ? styles.myRow : styles.otherRow]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={() => handleLongPress(item)}
            delayLongPress={350}
            style={[
              styles.messageBubble,
              isMe ? styles.myBubble : styles.otherBubble,
            ]}
          >
            {item.replyTo && (
              <View
                style={[
                  styles.replyPreviewInBubble,
                  isMe ? styles.replyPreviewMine : styles.replyPreviewOther,
                ]}
              >
                <Text
                  style={[
                    styles.replySender,
                    isMe ? styles.replySenderMine : styles.replySenderOther,
                  ]}
                  numberOfLines={1}
                >
                  {replySender}
                </Text>

                <Text
                  style={[
                    styles.replyQuotedText,
                    isMe ? styles.replyTextMine : styles.replyTextOther,
                  ]}
                  numberOfLines={2}
                >
                  {item.replyTo.text}
                </Text>
              </View>
            )}

            {!item.isDeleted && item.type === 'image' && item.mediaUrl ? (
              <TouchableOpacity onPress={() => openAttachment(item.mediaUrl!)}>
                <Image
                  source={{ uri: item.mediaUrl }}
                  style={styles.attachmentImage}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ) : null}

            {!item.isDeleted && item.type === 'video' && item.mediaUrl ? (
              <TouchableOpacity
                style={styles.fileAttachment}
                onPress={() => openAttachment(item.mediaUrl!)}
              >
                <Video size={24} color={isMe ? '#FFFFFF' : PURPLE} />
                <View style={styles.fileAttachmentText}>
                  <Text
                    style={[styles.fileName, isMe && styles.myText]}
                    numberOfLines={2}
                  >
                    {item.fileName || 'Video'}
                  </Text>
                  <Text style={[styles.fileHint, isMe && styles.myText]}>
                    Tap to open video
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {!item.isDeleted &&
            (item.type === 'document' || item.type === 'audio') &&
            item.mediaUrl ? (
              <TouchableOpacity
                style={styles.fileAttachment}
                onPress={() => openAttachment(item.mediaUrl!)}
              >
                {item.type === 'audio' ? (
                  <Music size={24} color={isMe ? '#FFFFFF' : PURPLE} />
                ) : (
                  <FileText size={24} color={isMe ? '#FFFFFF' : PURPLE} />
                )}

                <View style={styles.fileAttachmentText}>
                  <Text
                    style={[styles.fileName, isMe && styles.myText]}
                    numberOfLines={2}
                  >
                    {item.fileName || 'Document'}
                  </Text>
                  <Text style={[styles.fileHint, isMe && styles.myText]}>
                    {item.fileSize
                      ? `${(item.fileSize / 1024).toFixed(0)} KB · `
                      : ''}
                    Tap to open
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {(item.type === 'text' || !item.type || item.text || item.isDeleted) && (
              <Text
                style={[
                  styles.messageText,
                  isMe ? styles.myText : styles.otherText,
                  item.isDeleted && styles.deletedText,
                ]}
              >
                {item.isDeleted ? DELETED_TEXT : item.text}
              </Text>
            )}

            <View style={styles.messageMeta}>
              <Text style={[styles.messageTime, !isMe && styles.otherMessageTime]}>
                {getMessageTime(item.createdAt)}
              </Text>

              {isMe && !item.isDeleted && (
                <Text style={styles.statusText}>
                  {item.status === 'seen'
                    ? '✓✓ Seen'
                    : item.status === 'delivered'
                      ? '✓✓ Delivered'
                      : '✓ Sent'}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            stopTyping();
            navigation.goBack();
          }}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View>
          <Text style={styles.name}>{name}</Text>
          <Text
            style={[
              styles.online,
              {
                color: isTyping
                  ? '#25D366'
                  : isOnline
                    ? '#D8FFD8'
                    : '#E0E0E0',
              },
            ]}
          >
            {isTyping ? 'Typing...' : isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        style={styles.chatList}
        contentContainerStyle={styles.messageList}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {historyLoading ? (
              <>
                <ActivityIndicator color={PURPLE} />
                <Text style={styles.emptyText}>Loading messages...</Text>
              </>
            ) : (
              <Text style={styles.emptyText}>
                No messages yet
              </Text>
            )}
          </View>
        }
      />

      {replyingTo && (
        <View style={styles.replyingContainer}>
          <View style={styles.replyingAccent} />

          <View style={styles.replyingContent}>
            <Text style={styles.replyingTitle}>
              Replying to {replyingTo.sender === 'me' ? 'yourself' : name}
            </Text>
            <Text style={styles.replyingText} numberOfLines={2}>
              {replyingTo.isDeleted
                ? DELETED_TEXT
                : replyingTo.text || replyingTo.fileName || 'Attachment'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setReplyingTo(null)}
            style={styles.cancelReplyButton}
          >
            <X size={20} color="#666666" />
          </TouchableOpacity>
        </View>
      )}

      <View
        style={[
          styles.inputContainer,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <TouchableOpacity
          style={styles.attachButton}
          onPress={() => setAttachmentMenuVisible(true)}
          disabled={uploadingAttachment}
          accessibilityLabel="Attach a file"
        >
          {uploadingAttachment ? (
            <ActivityIndicator size="small" color={PURPLE} />
          ) : (
            <Paperclip size={23} color={PURPLE} />
          )}
        </TouchableOpacity>

        <TextInput
          value={message}
          onChangeText={handleTypingChange}
          placeholder="Type a message..."
          placeholderTextColor="#999999"
          style={styles.input}
          multiline
          maxLength={1000}
        />

        <TouchableOpacity
          style={styles.sendButton}
          onPress={sendMessage}
          activeOpacity={0.8}
        >
          <Send size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Modal
        transparent
        visible={attachmentMenuVisible}
        animationType="fade"
        onRequestClose={() => setAttachmentMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setAttachmentMenuVisible(false)}
        >
          <View
            style={styles.attachmentMenu}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.attachmentMenuTitle}>Attach</Text>

            <TouchableOpacity
              style={styles.attachmentOption}
              onPress={chooseGallery}
            >
              <ImageIcon size={22} color={PURPLE} />
              <Text style={styles.attachmentOptionText}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachmentOption}
              onPress={takePhoto}
            >
              <Camera size={22} color={PURPLE} />
              <Text style={styles.attachmentOptionText}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachmentOption}
              onPress={chooseDocument}
            >
              <FileText size={22} color={PURPLE} />
              <Text style={styles.attachmentOptionText}>Documents</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancel}
              onPress={() => setAttachmentMenuVisible(false)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
};

export default ChatRoom;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5FB',
  },
  header: {
    height: 90,
    backgroundColor: PURPLE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  backButton: {
    marginRight: 15,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  online: {
    fontSize: 12,
    marginTop: 2,
  },
  chatList: {
    flex: 1,
  },
  messageList: {
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 10,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    color: '#777777',
    fontSize: 14,
  },
  dateSeparatorContainer: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  dateSeparator: {
    backgroundColor: '#E9E2F5',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  dateSeparatorText: {
    color: '#5E4A7D',
    fontSize: 11,
    fontWeight: '700',
  },
  messageRow: {
    marginBottom: 10,
    flexDirection: 'row',
  },
  myRow: {
    justifyContent: 'flex-end',
  },
  otherRow: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 18,
  },
  myBubble: {
    backgroundColor: PURPLE,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
  },
  myText: {
    color: '#FFFFFF',
  },
  otherText: {
    color: '#333333',
  },
  deletedText: {
    fontStyle: 'italic',
    opacity: 0.75,
  },
  messageMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 5,
    gap: 6,
  },
  messageTime: {
    fontSize: 10,
    color: '#D8CDEE',
  },
  otherMessageTime: {
    color: '#888888',
  },
  statusText: {
    color: '#E5DFFF',
    fontSize: 10,
  },
  replyPreviewInBubble: {
    borderLeftWidth: 3,
    borderRadius: 5,
    paddingLeft: 8,
    paddingVertical: 4,
    marginBottom: 7,
  },
  replyPreviewMine: {
    borderLeftColor: '#D8C9FF',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  replyPreviewOther: {
    borderLeftColor: PURPLE,
    backgroundColor: '#F2EEF9',
  },
  replySender: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  replySenderMine: {
    color: '#E7DDFF',
  },
  replySenderOther: {
    color: PURPLE,
  },
  replyQuotedText: {
    fontSize: 12,
  },
  replyTextMine: {
    color: '#F5F0FF',
  },
  replyTextOther: {
    color: '#555555',
  },
  replyingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  replyingAccent: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: PURPLE,
    borderRadius: 2,
    marginRight: 9,
  },
  replyingContent: {
    flex: 1,
  },
  replyingTitle: {
    color: PURPLE,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  replyingText: {
    color: '#666666',
    fontSize: 12,
  },
  cancelReplyButton: {
    padding: 6,
    marginLeft: 6,
  },
  attachButton: {
    width: 38,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  attachmentImage: {
    width: 220,
    height: 180,
    borderRadius: 12,
    marginBottom: 4,
  },
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 160,
    paddingVertical: 6,
    gap: 9,
  },
  fileAttachmentText: {
    flex: 1,
    maxWidth: 190,
  },
  fileName: {
    color: '#333333',
    fontSize: 13,
    fontWeight: '700',
  },
  fileHint: {
    color: '#666666',
    fontSize: 11,
    marginTop: 3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    padding: 18,
  },
  attachmentMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 40,
  },
  attachmentMenuTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#222222',
    marginBottom: 4,
  },
  attachmentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  attachmentOptionText: {
    color: '#333333',
    fontSize: 16,
  },
  menuCancel: {
    alignItems: 'center',
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    marginTop: 8,
  },
  menuCancelText: {
    color: PURPLE,
    fontWeight: '700',
    fontSize: 15,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  input: {
    flex: 1,
    minHeight: 45,
    maxHeight: 100,
    backgroundColor: '#F2F0F6',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#333333',
  },
  sendButton: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
