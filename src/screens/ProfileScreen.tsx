
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, Camera, Edit3, Save, User} from 'lucide-react-native';

import type {RootStackParamList} from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

type ProfileData = {
  id: string;
  name: string;
  email: string;
  about: string;
  profilePhoto: string;
};

const API_URL = 'https://chatapp-6xj8.onrender.com';

const ProfileScreen = ({navigation, route}: Props) => {
  const {userId} = route.params;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/profile/${encodeURIComponent(userId)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Could not load profile');
      }

      setProfile(data);
      setName(data.name || '');
      setAbout(data.about || '');
      setProfilePhoto(data.profilePhoto || '');
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Could not load profile',
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const saveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }

    if (about.length > 150) {
      Alert.alert('About too long', 'About must be 150 characters or fewer.');
      return;
    }

    if (profilePhoto.trim() && !/^https?:\/\/\S+$/i.test(profilePhoto.trim())) {
      Alert.alert(
        'Invalid photo URL',
        'Please enter a valid URL starting with http:// or https://.',
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(`${API_URL}/profile/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          name: name.trim(),
          about: about.trim(),
          profilePhoto: profilePhoto.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Could not update profile');
      }

      setProfile(data.user);
      setName(data.user.name || '');
      setAbout(data.user.about || '');
      setProfilePhoto(data.user.profilePhoto || '');
      setEditing(false);

      Alert.alert('Success', 'Your profile has been updated.');
    } catch (error) {
      Alert.alert(
        'Update failed',
        error instanceof Error ? error.message : 'Could not update profile',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#8338EC" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Profile could not be loaded.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={loadProfile}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const displayedPhoto = editing ? profilePhoto.trim() : profile.profilePhoto;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Go back">
          <ArrowLeft size={23} color="#222" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>My Profile</Text>

        <TouchableOpacity
          onPress={() => {
            if (editing) {
              setName(profile.name);
              setAbout(profile.about || '');
              setProfilePhoto(profile.profilePhoto || '');
              setEditing(false);
            } else {
              setEditing(true);
            }
          }}
          style={styles.editButton}>
          {editing ? (
            <Text style={styles.cancelText}>Cancel</Text>
          ) : (
            <Edit3 size={21} color="#8338EC" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.profileTop}>
          <View style={styles.avatarWrapper}>
            {displayedPhoto ? (
              <Image
                source={{uri: displayedPhoto}}
                style={styles.avatar}
                onError={() => {
                  // Invalid or inaccessible photo URLs may not load.
                }}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <User size={48} color="#8338EC" />
              </View>
            )}

            {editing && (
              <View style={styles.cameraBadge}>
                <Camera size={16} color="#fff" />
              </View>
            )}
          </View>

          <Text style={styles.profileName}>{profile.name}</Text>
          <Text style={styles.profileEmail}>{profile.email}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Personal Information</Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={[styles.input, !editing && styles.readOnlyInput]}
            value={name}
            onChangeText={setName}
            editable={editing}
            placeholder="Enter your name"
            maxLength={80}
          />

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={[styles.input, styles.readOnlyInput]}
            value={profile.email}
            editable={false}
            keyboardType="email-address"
          />

          <Text style={styles.label}>About</Text>
          <TextInput
            style={[
              styles.input,
              styles.aboutInput,
              !editing && styles.readOnlyInput,
            ]}
            value={about}
            onChangeText={setAbout}
            editable={editing}
            placeholder="Write something about yourself..."
            multiline
            maxLength={150}
            textAlignVertical="top"
          />
          {editing && (
            <Text style={styles.characterCount}>{about.length}/150</Text>
          )}

          {editing && (
            <>
              <Text style={styles.label}>Profile Photo URL</Text>
              <TextInput
                style={styles.input}
                value={profilePhoto}
                onChangeText={setProfilePhoto}
                placeholder="https://example.com/photo.jpg"
                autoCapitalize="none"
                keyboardType="url"
              />
              <Text style={styles.hint}>
                Paste an image URL. Gallery selection is not enabled yet.
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, saving && styles.disabledButton]}
                onPress={saveProfile}
                disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Save size={18} color="#fff" />
                    <Text style={styles.primaryButtonText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F7FC',
  },
  centered: {
    flex: 1,
    backgroundColor: '#F8F7FC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  errorText: {
    color: '#444',
    fontSize: 16,
    marginBottom: 16,
  },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    backgroundColor: '#fff',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#222',
  },
  editButton: {
    minWidth: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: '#8338EC',
    fontWeight: '600',
  },
  content: {
    padding: 18,
    paddingBottom: 36,
  },
  profileTop: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarWrapper: {
    width: 112,
    height: 112,
    position: 'relative',
    marginBottom: 14,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#EAE2FA',
  },
  avatarPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#EAE2FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8338EC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#F8F7FC',
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
  },
  profileEmail: {
    fontSize: 14,
    color: '#777',
    marginTop: 5,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#222',
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#E5E1EC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#fff',
  },
  readOnlyInput: {
    backgroundColor: '#F7F6F9',
    color: '#777',
  },
  aboutInput: {
    minHeight: 100,
  },
  characterCount: {
    fontSize: 12,
    color: '#888',
    textAlign: 'right',
    marginTop: 5,
  },
  hint: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
  },
  primaryButton: {
    marginTop: 24,
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#8338EC',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.65,
  },
  backText: {
    marginTop: 16,
    color: '#8338EC',
    fontWeight: '600',
  },
});

export default ProfileScreen;