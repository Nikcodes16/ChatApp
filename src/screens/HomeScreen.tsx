
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
};

const PURPLE = '#8338EC';
const API_URL = 'https://chatapp-6xj8.onrender.com';

// Compare IDs consistently in case they contain whitespace or casing differences.
const normalizeId = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const HomeScreen = ({navigation, route}: Props) => {
  const {userId} = route.params;
  const insets = useSafeAreaInsets();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // UNREAD MESSAGE COUNTS
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // Load registered users
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      const usersUrl = `${API_URL}/users?exclude=${encodeURIComponent(userId)}`;
      console.log('FETCHING USERS FROM:', usersUrl);

      const response = await fetch(usersUrl);

      if (!response.ok) {
        throw new Error(`Users API error: ${response.status}`);
      }

      const result: unknown = await response.json();
      console.log('RAW USERS API RESPONSE:', result);

      if (!Array.isArray(result)) {
        throw new Error('Invalid users response');
      }

      const validUsers = (result as AppUser[]).filter(
        user =>
          user &&
          typeof user.id === 'string' &&
          typeof user.name === 'string' &&
          typeof user.email === 'string' &&
          normalizeId(user.id) !== normalizeId(userId),
      );

      console.log('REGISTERED USERS FROM API:', validUsers);
      console.log(
        'REGISTERED USER IDS:',
        validUsers.map(user => normalizeId(user.id)),
      );

      setUsers(validUsers);
    } catch (error) {
      console.error('FETCH USERS ERROR:', error);
      setErrorMessage('Users not loaded. check Network .');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load unread message counts
  
  // Load unread message counts
  const fetchUnreadCounts = useCallback(async () => {
    const url = `${API_URL}/unread-counts?userId=${encodeURIComponent(userId)}`;

    try {
      console.log('========== UNREAD API DEBUG ==========');
      console.log('API URL:', url);
      console.log('Current userId:', userId);

      const response = await fetch(url);
      const responseText = await response.text();

      console.log('HTTP STATUS:', response.status);
      console.log('RESPONSE BODY:', responseText);

      if (!response.ok) {
        throw new Error(
          `Unread API failed: HTTP ${response.status} - ${responseText}`,
        );
      }

      let result: Record<string, number>;

      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(
          `API did not return valid JSON: ${responseText}`,
        );
      }

      if (
        result === null ||
        typeof result !== 'object' ||
        Array.isArray(result)
      ) {
        throw new Error('Unexpected unread-counts response format');
      }

      const normalizedCounts: Record<string, number> = {};

      Object.entries(result).forEach(([id, count]) => {
        normalizedCounts[normalizeId(id)] = Math.max(
          0,
          Number(count) || 0,
        );
      });

      console.log('PARSED UNREAD COUNTS:', normalizedCounts);

      setUnreadCounts(normalizedCounts);
    } catch (error) {
      console.error('FETCH UNREAD COUNT ERROR:', error);
    }
  }, [userId]);

  useEffect(() => {
    fetchUsers();
    fetchUnreadCounts();
  }, [fetchUsers, fetchUnreadCounts]);

  // Refresh unread counts whenever Home screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchUnreadCounts();
    });

    return unsubscribe;
  }, [navigation, fetchUnreadCounts]);

  // Socket online/offline and unread-count updates
  useEffect(() => {
    const handleConnect = () => {
      console.log('SOCKET CONNECTED:', socket.id);
      console.log('EMITTING user_online:', userId);
      socket.emit('user_online', userId);

      // Refresh unread counts after socket reconnects
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
            .filter((id): id is string => id.length > 0),
        ),
      );

      console.log('ONLINE USERS RECEIVED:', validIds);
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

      console.log('USER STATUS RECEIVED:', {
        userId: statusUserId,
        online: data.online,
      });

      setOnlineUsers(previous => {
        if (data.online) {
          return previous.includes(statusUserId)
            ? previous
            : [...previous, statusUserId];
        }

        return previous.filter(id => id !== statusUserId);
      });
    };

    // Real-time unread count update from backend
    const handleUnreadCountUpdate = (data: {
      senderId?: string;
      count?: number;
    }) => {
      const senderId = normalizeId(data?.senderId);

      if (!senderId) {
        return;
      }

      const count = Math.max(0, Number(data?.count) || 0);

      console.log('UNREAD COUNT UPDATE RECEIVED:', {
        senderId,
        count,
      });

      setUnreadCounts(previous => ({
        ...previous,
        [senderId]: count,
      }));
    };

    // Register listeners before emitting the user's online status.
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('online_users', handleOnlineUsers);
    socket.on('user_status', handleUserStatus);
    socket.on('unread_count_update', handleUnreadCountUpdate);

    // Ensure this screen has a live socket connection.
    if (!socket.connected) {
      socket.connect();
    } else {
      // Handle a socket that connected before this screen mounted.
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

  // Search registered users
  const filteredUsers = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return users;
    }

    return users.filter(
      user =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query),
    );
  }, [users, searchText]);

  // Show only registered users who are online
  const activeUsers = useMemo(() => {
    const onlineIds = new Set(onlineUsers.map(normalizeId));

    const matchedUsers = filteredUsers.filter(user =>
      onlineIds.has(normalizeId(user.id)),
    );

    console.log('ONLINE ID MATCH DEBUG:', {
      registeredUserIds: filteredUsers.map(user => normalizeId(user.id)),
      onlineIds: Array.from(onlineIds),
      matchedUserIds: matchedUsers.map(user => normalizeId(user.id)),
    });

    return matchedUsers;
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
              {isOnline ? 'Online' : item.email}
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
          placeholder="Search users..."
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
                ? 'Could not load users.'
                : 'No registered users online'}
            </Text>
          }
        />
      )}

      <View style={styles.messageHeader}>
        <Text style={styles.sectionTitle}>Users</Text>
        <Text style={styles.messageCount}>{filteredUsers.length}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={PURPLE} style={styles.loading} />
      ) : errorMessage ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{errorMessage}</Text>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchUsers}>
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
                ? 'No users match your search.'
                : 'No other registered users found.'}
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
    onPress={() => {
      // Home is the current screen for now
    }}>
    <Home size={22} color="#999" />
    <Text style={styles.bottomText}>Home</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={styles.bottomItem}
    onPress={() => {
      // This screen currently displays users and chat entry points
    }}>
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
    bottom: 1,
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

  // NEW: unread message badge
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
    marginTop: 5,
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