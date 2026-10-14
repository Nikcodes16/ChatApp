
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
} from 'react-native';

import { RouteProp, useRoute } from '@react-navigation/native';
import { ArrowLeft, Send, X } from 'lucide-react-native';
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
};

const PURPLE = '#6C4AB6';
const API_URL = 'https://chatapp-6xj8.onrender.com';
const DELETED_MESSAGE_TEXT = 'This message was deleted';

const normalizeId = (value: unknown): string =>
  value == null ? '' : String(value);

// TIMESTAMP HELPERS
const getMessageDate = (item: any): string | undefined => {
  const value =
    item?.createdAt ??
    item?.timestamp ??
    item?.created_at ??
    item?.date;

  if (value == null) return undefined;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString();
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
    month: 'long',
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
    const timeA = a.createdAt
      ? new Date(a.createdAt).getTime()
      : 0;
    const timeB = b.createdAt
      ? new Date(b.createdAt).getTime()
      : 0;

    return timeA - timeB;
  });

const normalizeReply = (reply: any): ReplyPreview | null => {
  if (!reply || typeof reply !== 'object') return null;

  return {
    messageId: reply.messageId
      ? normalizeId(reply.messageId)
      : null,
    text: reply.text || '',
    sender: normalizeId(reply.sender),
  };
};

const ChatRoom = ({ navigation }: any) => {
  const route = useRoute<ChatRoomRouteProp>();
  const { name, currentUserId, chatUserId } = route.params;
  const insets = useSafeAreaInsets();

  const roomId =
    normalizeId(currentUserId) < normalizeId(chatUserId)
      ? `${currentUserId}_${chatUserId}`
      : `${chatUserId}_${currentUserId}`;

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatUserOnline, setIsChatUserOnline] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const flatListRef = useRef<FlatList<Message>>(null);
  const seenMessagesRef = useRef<Set<string>>(new Set());
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    socket.emit('typing', {
      roomId,
      userId: currentUserId,
      isTyping: false,
    });
  }, [roomId, currentUserId]);

  // REPLY HELPERS
  const getReplySenderId = (item: Message) =>
    item.sender === 'me'
      ? normalizeId(currentUserId)
      : normalizeId(chatUserId);

  const makeReplyPreview = (item: Message): ReplyPreview => ({
    messageId: normalizeId(item.id),
    text: item.isDeleted ? DELETED_MESSAGE_TEXT : item.text,
    sender: getReplySenderId(item),
  });

  const getReplySenderLabel = (senderId: string) => {
    if (normalizeId(senderId) === normalizeId(currentUserId)) {
      return 'You';
    }

    if (normalizeId(senderId) === normalizeId(chatUserId)) {
      return name;
    }

    return 'Reply';
  };

  // FORMAT DATABASE MESSAGE
  const formatDatabaseMessage = (item: any): Message => ({
    id: normalizeId(item._id ?? item.id),
    text: item.isDeleted
      ? DELETED_MESSAGE_TEXT
      : String(item.text ?? ''),
    sender:
      normalizeId(item.sender) === normalizeId(currentUserId)
        ? 'me'
        : 'other',
    roomId: normalizeId(item.roomId),
    status: item.status || 'sent',
    replyTo: normalizeReply(item.replyTo),
    isDeleted: Boolean(item.isDeleted),
    createdAt: getMessageDate(item),
  });

  // LOAD CHAT HISTORY
  useEffect(() => {
    let isMounted = true;

    const loadMessages = async () => {
      try {
        const response = await fetch(
          `${API_URL}/messages?roomId=${encodeURIComponent(
            roomId,
          )}&userId=${encodeURIComponent(currentUserId)}`,
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!isMounted || !Array.isArray(data)) return;

        const formattedMessages = sortMessages(
          data
            .map(formatDatabaseMessage)
            .filter((item: Message) => item.id.length > 0),
        );

        setMessages(formattedMessages);

        seenMessagesRef.current = new Set(
          formattedMessages
            .filter(item => item.status === 'seen')
            .map(item => item.id),
        );

        setTimeout(() => {
          if (isMounted) {
            flatListRef.current?.scrollToEnd({
              animated: false,
            });
          }
        }, 100);
      } catch (error) {
        console.log('Messages fetch error:', error);
      }
    };

    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [roomId, currentUserId]);

  // MARK RECEIVED MESSAGES AS SEEN
  useEffect(() => {
    if (!socket.connected) return;

    messages.forEach(item => {
      if (item.sender !== 'other' || item.isDeleted) return;

      if (
        item.status === 'seen' ||
        item.id.startsWith('temp_') ||
        seenMessagesRef.current.has(item.id)
      ) {
        return;
      }

      seenMessagesRef.current.add(item.id);
      socket.emit('message_seen', item.id);
    });
  }, [messages]);

  // KEYBOARD AUTO SCROLL
  useEffect(() => {
    const listener = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 300);
    });

    return () => listener.remove();
  }, []);

  // SOCKET EVENTS
  useEffect(() => {
    const handleConnect = () => {
      socket.emit('user_online', currentUserId);
      socket.emit('join_room', roomId);
      console.log('JOINED ROOM:', roomId);
    };

    // RECEIVE MESSAGE
    const handleReceiveMessage = (newMessage: any) => {
      if (normalizeId(newMessage.roomId) !== normalizeId(roomId)) {
        return;
      }

      const messageId = normalizeId(
        newMessage.id ?? newMessage._id,
      );

      if (!messageId) return;

      const receivedMessage: Message = {
        id: messageId,
        text: newMessage.isDeleted
          ? DELETED_MESSAGE_TEXT
          : String(newMessage.text ?? ''),
        sender:
          normalizeId(newMessage.sender) === normalizeId(currentUserId)
            ? 'me'
            : 'other',
        roomId: normalizeId(newMessage.roomId),
        status: newMessage.status || 'sent',
        replyTo: normalizeReply(newMessage.replyTo),
        isDeleted: Boolean(newMessage.isDeleted),
        createdAt:
          getMessageDate(newMessage) ?? new Date().toISOString(),
      };

      setMessages(prev => {
        const existingIndex = prev.findIndex(
          item => item.id === messageId,
        );

        if (existingIndex !== -1) {
          return sortMessages(
            prev.map(item =>
              item.id === messageId
                ? {
                    ...item,
                    ...receivedMessage,
                    createdAt:
                      receivedMessage.createdAt ?? item.createdAt,
                    replyTo:
                      receivedMessage.replyTo ?? item.replyTo,
                  }
                : item,
            ),
          );
        }

        const tempIndex = prev.findIndex(
          item =>
            item.id.startsWith('temp_') &&
            item.sender === 'me' &&
            item.text === receivedMessage.text &&
            item.roomId === receivedMessage.roomId &&
            normalizeId(newMessage.sender) ===
              normalizeId(currentUserId),
        );

        if (tempIndex !== -1) {
          return sortMessages(
            prev.map((item, index) =>
              index === tempIndex
                ? {
                    ...item,
                    ...receivedMessage,
                    createdAt:
                      receivedMessage.createdAt ?? item.createdAt,
                    replyTo:
                      receivedMessage.replyTo ?? item.replyTo,
                  }
                : item,
            ),
          );
        }

        return sortMessages([...prev, receivedMessage]);
      });

      if (receivedMessage.sender === 'other') {
        socket.emit('message_delivered', messageId);
      }

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    };

    // MESSAGE SAVED ON SERVER
    const handleMessageSent = (savedMessage: any) => {
      const savedId = normalizeId(
        savedMessage.id ?? savedMessage._id,
      );

      if (!savedId) return;

      const savedRoomId = normalizeId(savedMessage.roomId);

      if (savedRoomId && savedRoomId !== normalizeId(roomId)) {
        return;
      }

      const savedReply = normalizeReply(savedMessage.replyTo);

      setMessages(prev => {
        const existingIndex = prev.findIndex(
          item => item.id === savedId,
        );

        if (existingIndex !== -1) {
          return sortMessages(
            prev.map(item =>
              item.id === savedId
                ? {
                    ...item,
                    text: savedMessage.isDeleted
                      ? DELETED_MESSAGE_TEXT
                      : String(savedMessage.text ?? item.text),
                    status: savedMessage.status || item.status,
                    replyTo: savedReply ?? item.replyTo,
                    isDeleted: Boolean(savedMessage.isDeleted),
                    createdAt:
                      getMessageDate(savedMessage) ?? item.createdAt,
                  }
                : item,
            ),
          );
        }

        const tempIndex = prev.findIndex(
          item =>
            item.id.startsWith('temp_') &&
            item.sender === 'me' &&
            item.text === String(savedMessage.text ?? '') &&
            item.roomId === (savedRoomId || roomId),
        );

        if (tempIndex === -1) return prev;

        return sortMessages(
          prev.map((item, index) =>
            index === tempIndex
              ? {
                  ...item,
                  id: savedId,
                  text: savedMessage.isDeleted
                    ? DELETED_MESSAGE_TEXT
                    : String(savedMessage.text ?? item.text),
                  status: savedMessage.status || item.status,
                  replyTo: savedReply ?? item.replyTo,
                  isDeleted: Boolean(savedMessage.isDeleted),
                  createdAt:
                    getMessageDate(savedMessage) ?? item.createdAt,
                }
              : item,
          ),
        );
      });
    };

    // SENT / DELIVERED / SEEN STATUS
    const handleMessageStatus = (data: {
      messageId: string;
      status: MessageStatus;
    }) => {
      setMessages(prev =>
        prev.map(item =>
          normalizeId(item.id) === normalizeId(data.messageId)
            ? { ...item, status: data.status }
            : item,
        ),
      );
    };

    // DELETE FOR EVERYONE
    const handleMessageDeleted = (data: {
      messageId: string;
      roomId: string;
      text?: string;
      isDeleted?: boolean;
    }) => {
      if (normalizeId(data.roomId) !== normalizeId(roomId)) return;

      const deletedId = normalizeId(data.messageId);
      if (!deletedId) return;

      const deletedText = data.text || DELETED_MESSAGE_TEXT;

      setMessages(prev =>
        prev.map(item =>
          normalizeId(item.id) === deletedId
            ? { ...item, text: deletedText, isDeleted: true }
            : item,
        ),
      );

      setReplyingTo(prev =>
        prev && normalizeId(prev.id) === deletedId
          ? { ...prev, text: deletedText, isDeleted: true }
          : prev,
      );
    };

    // DELETE FOR ME
    const handleMessageDeletedForMe = (data: {
      messageId: string;
      roomId: string;
      userId: string;
    }) => {
      if (
        normalizeId(data.roomId) !== normalizeId(roomId) ||
        normalizeId(data.userId) !== normalizeId(currentUserId)
      ) {
        return;
      }

      const deletedId = normalizeId(data.messageId);
      if (!deletedId) return;

      setMessages(prev =>
        prev.filter(item => normalizeId(item.id) !== deletedId),
      );

      setReplyingTo(prev =>
        prev && normalizeId(prev.id) === deletedId ? null : prev,
      );
    };

    // DELETE ERROR
    const handleDeleteMessageError = (data: {
      message?: string;
    }) => {
      Alert.alert(
        'Unable to delete message',
        data?.message || 'Please try again.',
      );
    };

    // ONLINE / OFFLINE
    const handleUserStatus = (data: {
      userId: string;
      online: boolean;
    }) => {
      if (normalizeId(data.userId) === normalizeId(chatUserId)) {
        setIsChatUserOnline(data.online);
      }
    };

    const handleOnlineUsers = (userIds: string[]) => {
      setIsChatUserOnline(
        Array.isArray(userIds) &&
          userIds.some(
            id => normalizeId(id) === normalizeId(chatUserId),
          ),
      );
    };

    // TYPING INDICATOR
    const handleUserTyping = (data: {
      roomId: string;
      userId: string;
      isTyping: boolean;
    }) => {
      if (
        normalizeId(data.roomId) === normalizeId(roomId) &&
        normalizeId(data.userId) === normalizeId(chatUserId)
      ) {
        setIsOtherTyping(data.isTyping);
      }
    };

    const handleConnectError = (error: Error) => {
      console.log('SOCKET ERROR:', error.message);
    };

    socket.on('connect', handleConnect);
    socket.on('receive_message', handleReceiveMessage);
    socket.on('message_sent', handleMessageSent);
    socket.on('message_status', handleMessageStatus);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('message_deleted_for_me', handleMessageDeletedForMe);
    socket.on('delete_message_error', handleDeleteMessageError);
    socket.on('user_status', handleUserStatus);
    socket.on('online_users', handleOnlineUsers);
    socket.on('user_typing', handleUserTyping);
    socket.on('connect_error', handleConnectError);

    if (socket.connected) handleConnect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('receive_message', handleReceiveMessage);
      socket.off('message_sent', handleMessageSent);
      socket.off('message_status', handleMessageStatus);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('message_deleted_for_me', handleMessageDeletedForMe);
      socket.off('delete_message_error', handleDeleteMessageError);
      socket.off('user_status', handleUserStatus);
      socket.off('online_users', handleOnlineUsers);
      socket.off('user_typing', handleUserTyping);
      socket.off('connect_error', handleConnectError);

      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }

      socket.emit('typing', {
        roomId,
        userId: currentUserId,
        isTyping: false,
      });

      setIsOtherTyping(false);
    };
  }, [roomId, currentUserId, chatUserId, name]);

  // HANDLE TYPING
  const handleTyping = (text: string) => {
    setMessage(text);

    socket.emit('typing', {
      roomId,
      userId: currentUserId,
      isTyping: text.trim().length > 0,
    });

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    if (text.trim().length > 0) {
      typingTimerRef.current = setTimeout(() => {
        socket.emit('typing', {
          roomId,
          userId: currentUserId,
          isTyping: false,
        });

        typingTimerRef.current = null;
      }, 1200);
    }
  };

  // REPLY TO MESSAGE
  const handleReply = (item: Message) => {
    if (item.id.startsWith('temp_')) {
      Alert.alert('Please wait', 'This message is still being sent.');
      return;
    }

    setReplyingTo(item);
  };

  // DELETE FOR ME
  const handleDeleteForMe = (item: Message) => {
    if (item.id.startsWith('temp_')) {
      Alert.alert('Please wait', 'This message is still being sent.');
      return;
    }

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
              messageId: normalizeId(item.id),
              userId: normalizeId(currentUserId),
              roomId: normalizeId(roomId),
            });
          },
        },
      ],
    );
  };

  // DELETE FOR EVERYONE
  const handleDeleteMessage = (item: Message) => {
    if (
      item.sender !== 'me' ||
      item.id.startsWith('temp_') ||
      item.isDeleted
    ) {
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
              messageId: normalizeId(item.id),
              userId: normalizeId(currentUserId),
              roomId: normalizeId(roomId),
            });
          },
        },
      ],
    );
  };

  // LONG-PRESS MESSAGE MENU
  const handleLongPress = (item: Message) => {
    if (item.isDeleted || item.id.startsWith('temp_')) return;

    const buttons: any[] = [
      { text: 'Reply', onPress: () => handleReply(item) },
      {
        text: 'Delete for me',
        style: 'destructive',
        onPress: () => handleDeleteForMe(item),
      },
    ];

    if (item.sender === 'me') {
      buttons.push({
        text: 'Delete for everyone',
        style: 'destructive',
        onPress: () => handleDeleteMessage(item),
      });
    }

    buttons.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Message options', 'Choose an action', buttons);
  };

  // SEND MESSAGE
  const sendMessage = () => {
    const text = message.trim();
    if (!text) return;

    if (!socket.connected) {
      Alert.alert(
        'Connection unavailable',
        'Please wait for the chat to reconnect, then try again.',
      );
      return;
    }

    stopTyping();

    const temporaryId = `temp_${Date.now()}`;
    const replyPreview = replyingTo
      ? makeReplyPreview(replyingTo)
      : null;
    const createdAt = new Date().toISOString();

    const newMessage = {
      id: temporaryId,
      clientTempId: temporaryId,
      text,
      sender: normalizeId(currentUserId),
      receiver: normalizeId(chatUserId),
      roomId,
      replyTo: replyPreview,
      createdAt,
    };

    setMessages(prev =>
      sortMessages([
        ...prev,
        {
          id: temporaryId,
          text,
          sender: 'me',
          roomId,
          status: 'sent',
          replyTo: replyPreview,
          createdAt,
        },
      ]),
    );

    socket.emit('send_message', newMessage);
    setMessage('');
    setReplyingTo(null);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // MESSAGE STATUS TEXT
  const getStatusText = (status: MessageStatus) => {
    if (status === 'delivered') return '✓✓ delivered';
    if (status === 'seen') return '✓✓ seen';
    return '✓ sent';
  };

  // RENDER MESSAGE WITH TIMELINE
  const renderMessage = ({
    item,
    index,
  }: {
    item: Message;
    index: number;
  }) => {
    const isMe = item.sender === 'me';
    const previousMessage = messages[index - 1];

    const showDate =
      !!item.createdAt &&
      (index === 0 ||
        getDayKey(item.createdAt) !==
          getDayKey(previousMessage?.createdAt));

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

        <View
          style={[
            styles.messageRow,
            isMe ? styles.myRow : styles.otherRow,
          ]}
        >
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
                  isMe
                    ? styles.replyPreviewMine
                    : styles.replyPreviewOther,
                ]}
              >
                <Text
                  style={[
                    styles.replySender,
                    isMe
                      ? styles.replySenderMine
                      : styles.replySenderOther,
                  ]}
                  numberOfLines={1}
                >
                  {getReplySenderLabel(item.replyTo.sender)}
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

            <Text
              style={[
                styles.messageText,
                isMe ? styles.myText : styles.otherText,
                item.isDeleted && styles.deletedText,
              ]}
            >
              {item.isDeleted ? DELETED_MESSAGE_TEXT : item.text}
            </Text>

            <View style={styles.messageMeta}>
              <Text
                style={[
                  styles.messageTime,
                  !isMe && styles.otherMessageTime,
                ]}
              >
                {getMessageTime(item.createdAt)}
              </Text>

              {isMe && !item.isDeleted && (
                <Text style={styles.statusText}>
                  {getStatusText(item.status)}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // SCREEN UI
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
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>

        <View>
          <Text style={styles.name}>{name}</Text>
          <Text
            style={[
              styles.online,
              {
                color: isOtherTyping
                  ? '#25D366'
                  : isChatUserOnline
                    ? '#D8FFD8'
                    : '#E0E0E0',
              },
            ]}
          >
            {isOtherTyping
              ? 'typing...'
              : isChatUserOnline
                ? 'Online'
                : 'Offline'}
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
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
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
                ? DELETED_MESSAGE_TEXT
                : replyingTo.text}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setReplyingTo(null)}
            style={styles.cancelReplyButton}
            accessibilityLabel="Cancel reply"
          >
            <X size={20} color="#666" />
          </TouchableOpacity>
        </View>
      )}

      <View
        style={[
          styles.inputContainer,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <TextInput
          value={message}
          onChangeText={handleTyping}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          style={styles.input}
          multiline
          maxLength={1000}
        />

        <TouchableOpacity
          style={styles.sendButton}
          onPress={sendMessage}
          activeOpacity={0.8}
        >
          <Send size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

export default ChatRoom;

// STYLES
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
    color: '#fff',
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

  // TIMELINE STYLES
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
    maxWidth: '75%',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 18,
  },
  myBubble: {
    backgroundColor: PURPLE,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
  },
  myText: {
    color: '#fff',
  },
  otherText: {
    color: '#333',
  },
  deletedText: {
    fontStyle: 'italic',
    opacity: 0.75,
  },

  // MESSAGE TIME AND STATUS
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
    color: '#888',
  },
  statusText: {
    color: '#E5DFFF',
    fontSize: 10,
  },

  // REPLY STYLES
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
    color: '#555',
  },

  // REPLY COMPOSER
  replyingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
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
    color: '#666',
    fontSize: 12,
  },
  cancelReplyButton: {
    padding: 6,
    marginLeft: 6,
  },

  // INPUT STYLES
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
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
    color: '#333',
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