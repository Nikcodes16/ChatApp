
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  ArrowLeft,
  MoreHorizontal,
  Search,
  Home,
  MessageCircle,
  Phone,
  User,
} from 'lucide-react-native';

import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/AppNavigator';
import socket from '../services/socket';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type AppUser = {
  id: string;
  name: string;
  email: string;
  lastMessage?: string;
  lastMessageTime?: string;
};

type ChatMessage = {
  roomId?: string;
  text?: string;
  message?: string;
  content?: string;
  fileName?: string;
  createdAt?: string | number;
  timestamp?: string | number;
  time?: string | number;
  [key: string]: unknown;
};

const PURPLE = '#8338EC';
const API_URL = 'https://chatapp-6xj8.onrender.com';

const normalizeId = (value: unknown): string =>
  value == null ? '' : String(value).trim().toLowerCase();

const makeRoomId = (firstId: string, secondId: string): string => {
  const first = String(firstId ?? '').trim();
  const second = String(secondId ?? '').trim();

  return first < second
    ? `${first}_${second}`
    : `${second}_${first}`;
};

const getMessageTime = (message: ChatMessage): number => {
  const value =
    message.createdAt ?? message.timestamp ?? message.time ?? 0;

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
};

const getMessagePreview = (message: ChatMessage): string => {
  const text =
    message.text ??
    message.message ??
    message.content;

  if (typeof text === 'string' && text.trim()) {
    return text.trim();
  }

  if (typeof message.fileName === 'string' && message.fileName.trim()) {
    return `📎 ${message.fileName}`;
  }

  return 'Message';
};

const HomeScreen = ({navigation, route}: Props) => {
  const {userId} = route.params;
  const insets = useSafeAreaInsets();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // Load registered users, then keep only users with existing messages.
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      const usersUrl =
        `${API_URL}/users?exclude=${encodeURIComponent(userId)}`;

      const response = await fetch(usersUrl);
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Users API error: ${response.status}`);
      }

      let result: unknown;

      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error('Users API returned invalid JSON');
      }

      if (!Array.isArray(result)) {
        throw new Error('Invalid users response: expected an array');
      }

      const registeredUsers: AppUser[] = result
        .filter((item: any) => item && typeof item === 'object')
        .map((item: any): AppUser | null => {
          const id = String(
            item._id ?? item.id ?? item.userId ?? '',
          ).trim();

          if (
            !id ||
            typeof item.name !== 'string' ||
            typeof item.email !== 'string'
          ) {
            return null;
          }

          return {
            id,
            name: item.name,
            email: item.email,
          };
        })
        .filter((item): item is AppUser => item !== null)
        .filter(item => normalizeId(item.id) !== normalizeId(userId));

      const conversationResults = await Promise.all(
        registeredUsers.map(async person => {
          const roomId = makeRoomId(userId, person.id);

          const messagesUrl =
            `${API_URL}/messages?roomId=${encodeURIComponent(roomId)}` +
            `&userId=${encodeURIComponent(userId)}`;

          try {
            const messagesResponse = await fetch(messagesUrl);

            if (!messagesResponse.ok) {
              console.warn(
                'Could not load messages for:',
                person.id,
                messagesResponse.status,
              );
              return null;
            }

            const messagesText = await messagesResponse.text();

            let chatMessages: unknown;

            try {
              chatMessages = JSON.parse(messagesText);
            } catch {
              console.warn('Invalid messages response:', person.id);
              return null;
            }

            if (!Array.isArray(chatMessages) || chatMessages.length === 0) {
              return null;
            }

            const messages = chatMessages as ChatMessage[];

            // If roomId is returned, verify it matches this conversation.
            const roomMessages = messages.filter(message => {
              if (!message || typeof message !== 'object') {
                return false;
              }

              if (!message.roomId) {
                return true;
              }

              return normalizeId(message.roomId) === normalizeId(roomId);
            });

            if (roomMessages.length === 0) {
              return null;
            }

            const sortedMessages = [...roomMessages].sort(
              (a, b) => getMessageTime(b) - getMessageTime(a),
            );

            const latestMessage = sortedMessages[0];

            return {
              ...person,
              lastMessage: getMessagePreview(latestMessage),
              lastMessageTime: String(
                latestMessage.createdAt ??
                  latestMessage.timestamp ??
                  latestMessage.time ??
                  '',
              ),
            } as AppUser;
          } catch (error) {
            console.warn(
              'Conversation check failed for:',
              person.id,
              error,
            );
            return null;
          }
        }),
      );

      const conversationUsers = conversationResults
        .filter((person): person is AppUser => person !== null)
        .sort(
          (a, b) =>
            getMessageTime({
              timestamp: b.lastMessageTime,
            }) -
            getMessageTime({
              timestamp: a.lastMessageTime,
            }),
        );

      setUsers(conversationUsers);
    } catch (error) {
      console.error('FETCH CONVERSATIONS ERROR:', error);
      setErrorMessage(
        'Chats not loaded. Check your network and retry.',
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load unread message counts.
  const fetchUnreadCounts = useCallback(async () => {
    const url =
      `${API_URL}/unread-counts?userId=${encodeURIComponent(userId)}`;

    try {
      const response = await fetch(url);
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Unread API failed: HTTP ${response.status}`);
      }

      let result: unknown;

      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error('Unread API returned invalid JSON');
      }

      if (
        !result ||
        typeof result !== 'object' ||
        Array.isArray(result)
      ) {
        throw new Error('Unexpected unread-counts response format');
      }

      const normalizedCounts: Record<string, number> = {};

      Object.entries(result as Record<string, unknown>).forEach(
        ([id, count]) => {
          normalizedCounts[normalizeId(id)] = Math.max(
            0,
            Number(count) || 0,
          );
        },
      );

      setUnreadCounts(normalizedCounts);
    } catch (error) {
      console.error('FETCH UNREAD COUNT ERROR:', error);
    }
  }, [userId]);

  useEffect(() => {
    fetchUsers();
    fetchUnreadCounts();
  }, [fetchUsers, fetchUnreadCounts]);

  // Refresh when the Home screen becomes active.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchUsers();
      fetchUnreadCounts();
    });

    return unsubscribe;
  }, [navigation, fetchUsers, fetchUnreadCounts]);

  // Socket online/offline and unread-count updates.
  useEffect(() => {
    const handleConnect = () => {
      console.log('SOCKET CONNECTED:', socket.id);
      socket.emit('user_online', userId);
      fetchUnreadCounts();
    };

    const handleDisconnect = (reason: string) => {
      console.log('SOCKET DISCONNECTED:', reason);
    };

    const handleConnectError = (error: Error) => {
      console.error('SOCKET ERROR:', error.message);
    };

    const handleOnlineUsers = (ids: unknown) => {
      if (!Array.isArray(ids)) {
        console.log('Invalid online_users payload:', ids);
        return;
      }

      const validIds = Array.from(
        new Set(
          ids
            .map(normalizeId)
            .filter(id => id.length > 0),
        ),
      );

      setOnlineUsers(validIds);
    };

    const handleUserStatus = (data: {
      userId?: string;
      online?: boolean;
    }) => {
      const statusUserId = normalizeId(data?.userId);

      if (!statusUserId) {
        return;
      }

      setOnlineUsers(previous => {
        if (data.online) {
          return previous.includes(statusUserId)
            ? previous
            : [...previous, statusUserId];
        }

        return previous.filter(id => id !== statusUserId);
      });
    };

    const handleUnreadCountUpdate = (data: {
      senderId?: string;
      count?: number;
    }) => {
      const senderId = normalizeId(data?.senderId);

      if (!senderId) {
        return;
      }

      const count = Math.max(0, Number(data?.count) || 0);

      setUnreadCounts(previous => ({
        ...previous,
        [senderId]: count,
      }));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('online_users', handleOnlineUsers);
    socket.on('user_status', handleUserStatus);
    socket.on('unread_count_update', handleUnreadCountUpdate);

    if (!socket.connected) {
      socket.connect();
    } else {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('online_users', handleOnlineUsers);
      socket.off('user_status', handleUserStatus);
      socket.off('unread_count_update', handleUnreadCountUpdate);
    };
  }, [userId, fetchUnreadCounts]);

  // Search within existing conversations.
  const filteredUsers = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return users;
    }

    return users.filter(
      item =>
        item.name.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query) ||
        (item.lastMessage ?? '').toLowerCase().includes(query),
    );
  }, [users, searchText]);

  // Existing conversation partners who are online.
  const activeUsers = useMemo(() => {
    const onlineIds = new Set(onlineUsers.map(normalizeId));

    return filteredUsers.filter(item =>
      onlineIds.has(normalizeId(item.id)),
    );
  }, [filteredUsers, onlineUsers]);

  const openChat = useCallback(
    (name: string, chatUserId: string) => {
      navigation.navigate('ChatRoom', {
        name,
        currentUserId: userId,
        chatUserId,
      });
    },
    [navigation, userId],
  );

  const renderActiveUser = ({item}: {item: AppUser}) => (
    <TouchableOpacity
      style={styles.activeUser}
      onPress={() => openChat(item.name, item.id)}
      activeOpacity={0.8}>
      <View style={styles.activeImageContainer}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarLetter}>
            {item.name.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.onlineDot} />
      </View>

      <Text style={styles.activeName} numberOfLines={1}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderUser = ({item}: {item: AppUser}) => {
    const isOnline = onlineUsers.includes(normalizeId(item.id));
    const unreadCount = unreadCounts[normalizeId(item.id)] || 0;

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => openChat(item.name, item.id)}
        activeOpacity={0.8}>
        <View style={styles.chatImageContainer}>
          <View style={styles.chatAvatar}>
            <Text style={styles.avatarLetter}>
              {item.name.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          {isOnline && <View style={styles.chatOnlineDot} />}
        </View>

        <View style={styles.chatContent}>
          <View style={styles.chatTopRow}>
            <Text style={styles.chatName} numberOfLines={1}>
              {item.name}
            </Text>

            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.chatBottomRow}>
            <Text style={styles.chatMessage} numberOfLines={1}>
              {item.lastMessage || 'No messages yet'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#222" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Message</Text>

        <TouchableOpacity style={styles.headerButton}>
          <MoreHorizontal size={24} color="#222" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your conversations..."
          placeholderTextColor="#999"
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Active Now</Text>
        <Text style={styles.seeAll}>{activeUsers.length} online</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={PURPLE} style={styles.loading} />
      ) : (
        <FlatList
          data={activeUsers}
          renderItem={renderActiveUser}
          keyExtractor={item => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.activeList}
          ListEmptyComponent={
            <Text style={styles.emptyActive}>
              {errorMessage
                ? 'Could not load conversations.'
                : 'No one is online'}
            </Text>
          }
        />
      )}

      <View style={styles.messageHeader}>
        <Text style={styles.sectionTitle}>Messages</Text>
        <Text style={styles.messageCount}>{filteredUsers.length}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={PURPLE} style={styles.loading} />
      ) : errorMessage ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              fetchUsers();
              fetchUnreadCounts();
            }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={renderUser}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.chatList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchText
                ? 'No conversations match your search.'
                : 'No conversations yet. Start chatting with someone to see them here.'}
            </Text>
          }
        />
      )}

      <View
        style={[
          styles.bottomBar,
          {
            height: 70 + insets.bottom,
            paddingBottom: insets.bottom,
          },
        ]}>
        <TouchableOpacity
          style={styles.bottomItem}
          onPress={() => navigation.navigate('Dashboard', {userId})}>
          <Home size={22} color="#999" />
          <Text style={styles.bottomText}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomItem}>
          <View style={styles.activeIcon}>
            <MessageCircle size={21} color="#fff" />
          </View>
          <Text style={styles.activeBottomText}>Message</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomItem}
          onPress={() => navigation.navigate('Calls')}>
          <Phone size={22} color="#999" />
          <Text style={styles.bottomText}>Calls</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomItem}
          onPress={() => navigation.navigate('Profile', {userId})}>
          <User size={22} color="#999" />
          <Text style={styles.bottomText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
  },
  searchContainer: {
    height: 48,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 22,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 15,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: '#222',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
  },
  seeAll: {
    fontSize: 13,
    color: PURPLE,
    fontWeight: '600',
  },
  activeList: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 25,
  },
  activeUser: {
    width: 65,
    marginRight: 17,
    alignItems: 'center',
  },
  activeImageContainer: {
    position: 'relative',
  },
  avatarPlaceholder: {
    width: 55,
    height: 55,
    borderRadius: 28,
    backgroundColor: '#F0E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: PURPLE,
    fontSize: 20,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#25D366',
    borderWidth: 2,
    borderColor: '#fff',
  },
  activeName: {
    marginTop: 6,
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 5,
  },
  messageCount: {
    marginLeft: 8,
    backgroundColor: '#F0E8FF',
    color: PURPLE,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  chatList: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  chatImageContainer: {
    position: 'relative',
  },
  chatAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#F0E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatOnlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#25D366',
    borderWidth: 2,
    borderColor: '#fff',
  },
  chatContent: {
    flex: 1,
    marginLeft: 14,
  },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    marginRight: 10,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  chatBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  chatMessage: {
    flex: 1,
    fontSize: 13,
    color: '#888',
    marginRight: 10,
  },
  loading: {
    marginVertical: 20,
  },
  emptyActive: {
    fontSize: 13,
    color: '#888',
    paddingTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 15,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: PURPLE,
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bottomItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  activeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomText: {
    fontSize: 10,
    color: '#999',
    marginTop: 3,
  },
  activeBottomText: {
    fontSize: 10,
    color: PURPLE,
    fontWeight: '600',
    marginTop: 3,
  },
});
