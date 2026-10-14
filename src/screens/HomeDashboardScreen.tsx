
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import {
  ArrowRight,
  MessageCircle,
  Phone,
  Search,
  UserRound,
  Users,
} from 'lucide-react-native';

import { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

type Contact = {
  id: string;
  name: string;
  email: string;
  about?: string;
  profilePhoto?: string;
};

const API_URL = 'https://chatapp-6xj8.onrender.com';

export default function HomeDashboardScreen({
  navigation,
  route,
}: Props) {
  const { userId } = route.params;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadContacts = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/users?exclude=${encodeURIComponent(userId)}`,
      );

      const contentType =
        response.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        throw new Error('Server se valid JSON response nahi mila.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Contacts load nahi hue.');
      }

      setContacts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Dashboard contacts error:', error);
      Alert.alert(
        'Connection error',
        'Contacts load nahi ho paaye. Internet check karke dobara try karo.',
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const filteredContacts = contacts.filter(contact => {
    const query = search.trim().toLowerCase();

    return (
      contact.name?.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query)
    );
  });

  const openMessages = () => {
    navigation.navigate('Home', { userId });
  };

  const openChat = (contact: Contact) => {
    navigation.navigate('ChatRoom', {
      name: contact.name,
      currentUserId: userId,
      chatUserId: contact.id,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>WELCOME BACK</Text>
            <Text style={styles.title}>Your conversations.</Text>
            <Text style={styles.subtitle}>
              Stay connected with your people.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate('Profile', { userId })}
            accessibilityLabel="Open profile"
          >
            <UserRound color="#FFFFFF" size={25} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchBox}>
          <Search color="#64748B" size={21} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search people or email..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>

        <Text style={styles.sectionTitle}>Quick actions</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionCard, styles.messageCard]}
            onPress={openMessages}
          >
            <View style={styles.actionIconBlue}>
              <MessageCircle color="#2563EB" size={24} />
            </View>
            <Text style={styles.actionTitle}>Messages</Text>
            <Text style={styles.actionSubtitle}>
              Open your chats
            </Text>
            <ArrowRight
              color="#2563EB"
              size={19}
              style={styles.actionArrow}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, styles.callsCard]}
            onPress={() => navigation.navigate('Calls', { userId })}
          >
            <View style={styles.actionIconGreen}>
              <Phone color="#15803D" size={24} />
            </View>
            <Text style={styles.actionTitle}>Calls</Text>
            <Text style={styles.actionSubtitle}>
              Call activity
            </Text>
            <ArrowRight
              color="#15803D"
              size={19}
              style={styles.actionArrow}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>People</Text>
            <Text style={styles.sectionSubtitle}>
              Find someone to chat with
            </Text>
          </View>

          <TouchableOpacity onPress={openMessages}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>
              Loading people...
            </Text>
          </View>
        ) : filteredContacts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Users color="#94A3B8" size={35} />
            <Text style={styles.emptyTitle}>
              {search ? 'No matching people' : 'No contacts found'}
            </Text>
            <Text style={styles.emptyText}>
              {search
                ? 'Try another name or email.'
                : 'New users will appear here.'}
            </Text>

            {!search && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={loadContacts}
              >
                <Text style={styles.retryText}>Refresh</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredContacts.slice(0, 8).map(contact => (
            <TouchableOpacity
              key={contact.id}
              style={styles.contactRow}
              onPress={() => openChat(contact)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(contact.name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>

              <View style={styles.contactInfo}>
                <Text style={styles.contactName} numberOfLines={1}>
                  {contact.name}
                </Text>
                <Text style={styles.contactEmail} numberOfLines={1}>
                  {contact.email}
                </Text>
              </View>

              <ArrowRight color="#94A3B8" size={19} />
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity
          style={styles.profileLink}
          onPress={() => navigation.navigate('Profile', { userId })}
        >
          <UserRound color="#475569" size={20} />
          <Text style={styles.profileLinkText}>
            View and edit your profile
          </Text>
          <ArrowRight color="#64748B" size={19} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
    paddingBottom: 35,
  },
  header: {
    backgroundColor: '#172554',
    borderRadius: 24,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  headerText: {
    flex: 1,
    paddingRight: 10,
  },
  eyebrow: {
    color: '#BFDBFE',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 9,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '800',
  },
  subtitle: {
    color: '#DBEAFE',
    fontSize: 13,
    marginTop: 7,
  },
  profileButton: {
    height: 48,
    width: 48,
    borderRadius: 24,
    backgroundColor: '#334B80',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    minHeight: 52,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 15,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 26,
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 14,
    marginLeft: 10,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    marginBottom: 28,
  },
  actionCard: {
    flex: 1,
    minHeight: 158,
    borderRadius: 18,
    padding: 15,
  },
  messageCard: {
    backgroundColor: '#EFF6FF',
  },
  callsCard: {
    backgroundColor: '#F0FDF4',
  },
  actionIconBlue: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionIconGreen: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 15,
  },
  actionSubtitle: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 5,
  },
  actionArrow: {
    position: 'absolute',
    right: 13,
    bottom: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 5,
  },
  viewAll: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 13,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 35,
  },
  loadingText: {
    color: '#64748B',
    marginTop: 10,
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    alignItems: 'center',
    padding: 25,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyText: {
    color: '#64748B',
    textAlign: 'center',
    fontSize: 13,
    marginTop: 6,
  },
  retryButton: {
    marginTop: 15,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#DBEAFE',
    borderRadius: 10,
  },
  retryText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 13,
    borderRadius: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#1D4ED8',
    fontWeight: '800',
    fontSize: 18,
  },
  contactInfo: {
    flex: 1,
    marginHorizontal: 12,
  },
  contactName: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  contactEmail: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginTop: 20,
    gap: 10,
  },
  profileLinkText: {
    flex: 1,
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
});