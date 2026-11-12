
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import * as Keychain from 'react-native-keychain';
import RazorpayCheckout from 'react-native-razorpay';
import {
  ArrowLeft,
  Camera,
  Crown,
  Edit3,
  Save,
  User,
  Upload,
} from 'lucide-react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import type {RootStackParamList} from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

type ProfileData = {
  id: string;
  name: string;
  email: string;
  about: string;
  profilePhoto: string;
  isPremium?: boolean;
  premiumUntil?: string | null;
};

type ApiProfileResponse = {
  message?: string;
  user?: ProfileData;
  id?: string;
  name?: string;
  email?: string;
  about?: string;
  profilePhoto?: string;
};

const API_URL = 'https://chatapp-6xj8.onrender.com';
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

const ProfileScreen = ({navigation, route}: Props) => {
  const {userId} = route.params;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [purchasingPremium, setPurchasingPremium] = useState(false);
  const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
  // Logout modal state
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/profile/${encodeURIComponent(userId)}`,
      );

      const data: ProfileData & {message?: string} = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Could not load profile.');
      }

      setProfile(data);
      setName(data.name || '');
      setAbout(data.about || '');
      setProfilePhoto(data.profilePhoto || '');
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Could not load profile.',
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Open the logout confirmation modal
  const openLogoutModal = () => {
    setLogoutError('');
    setLogoutModalVisible(true);
  };

  // Close the logout confirmation modal
  const closeLogoutModal = () => {
    if (loggingOut) {
      return;
    }

    setLogoutError('');
    setLogoutModalVisible(false);
  };

  // Clear saved credentials and return to Login
  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    try {
      setLoggingOut(true);
      setLogoutError('');

      await Keychain.resetGenericPassword({
        service: 'com.chatapp.auth',
      });

      setLogoutModalVisible(false);

      navigation.reset({
        index: 0,
        routes: [{name: 'Login'}],
      });
    } catch (error) {
      console.error('Logout error:', error);
      setLogoutError('Logout failed. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  const upgradeToPremium = async () => {
    if (purchasingPremium) {
      return;
    }

    try {
      setPurchasingPremium(true);

      const credentials = await Keychain.getGenericPassword({
        service: 'com.chatapp.auth',
      });

      if (credentials === false || !credentials.password) {
        Alert.alert(
          'Login required',
          'Your secure login session was not found. Please log out and log in again.',
        );
        return;
      }

      const token = credentials.password;

      const orderResponse = await fetch(
        `${API_URL}/payments/create-order`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const orderData = await orderResponse.json();

      if (!orderResponse.ok) {
        throw new Error(
          orderData.message || 'Could not create payment order.',
        );
      }

      if (!orderData.orderId || !orderData.keyId || !orderData.amount) {
        throw new Error('The server returned incomplete order details.');
      }

      const checkoutResult = await RazorpayCheckout.open({
        key: orderData.keyId,
        amount: String(orderData.amount),
        currency: orderData.currency || 'INR',
        name: 'ChatApp Premium',
        description: '30-day Premium test subscription',
        order_id: orderData.orderId,
        prefill: {
          name: profile?.name || '',
          email: profile?.email || '',
        },
        theme: {color: '#8338EC'},
      });

      const paymentResponse = await fetch(
        `${API_URL}/payments/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            razorpay_order_id: checkoutResult.razorpay_order_id,
            razorpay_payment_id: checkoutResult.razorpay_payment_id,
            razorpay_signature: checkoutResult.razorpay_signature,
          }),
        },
      );

      const verificationData = await paymentResponse.json();

      if (!paymentResponse.ok) {
        throw new Error(
          verificationData.message ||
            'Payment could not be verified. Please contact support before trying to pay again.',
        );
      }

      await loadProfile();

      Alert.alert(
        'Premium activated!',
        `Your Premium access is active${
          verificationData.premiumUntil
            ? ` until ${new Date(
                verificationData.premiumUntil,
              ).toLocaleDateString()}`
            : ''
        }.`,
      );
    } catch (error: any) {
      const description = String(
        error?.description ||
          error?.message ||
          'Payment could not be completed.',
      );

      const isCancelled =
        error?.code === 0 ||
        /cancel|dismiss|payment cancelled/i.test(description);

      if (!isCancelled) {
        Alert.alert('Payment not completed', description);
      }
    } finally {
      setPurchasingPremium(false);
    }
  };

  const choosePhoto = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: false,
      });

      if (result.didCancel) {
        return;
      }

      if (result.errorCode) {
        Alert.alert(
          'Gallery error',
          result.errorMessage || 'Could not open the photo gallery.',
        );
        return;
      }

      const asset = result.assets?.[0];

      if (!asset?.uri) {
        Alert.alert(
          'No photo selected',
          'Please select a photo and try again.',
        );
        return;
      }

      if (asset.fileSize && asset.fileSize > MAX_PHOTO_SIZE) {
        Alert.alert(
          'Photo too large',
          'Please select a photo smaller than 5 MB.',
        );
        return;
      }

      if (
        asset.type &&
        !['image/jpeg', 'image/png', 'image/webp'].includes(asset.type)
      ) {
        Alert.alert(
          'Unsupported image',
          'Please select a JPG, PNG, or WebP image.',
        );
        return;
      }

      await uploadPhoto({
        uri: asset.uri,
        fileName: asset.fileName || `profile-${Date.now()}.jpg`,
        type: asset.type || 'image/jpeg',
      });
    } catch (error) {
      Alert.alert(
        'Gallery error',
        error instanceof Error
          ? error.message
          : 'Could not select photo.',
      );
    }
  };

  const uploadPhoto = async (photo: {
    uri: string;
    fileName: string;
    type: string;
  }) => {
    const formData = new FormData();

    formData.append(
      'photo',
      {
        uri: photo.uri,
        name: photo.fileName,
        type: photo.type,
      } as unknown as Blob,
    );

    try {
      setUploading(true);

      const response = await fetch(
        `${API_URL}/upload/profile-photo/${encodeURIComponent(userId)}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
          },
          body: formData,
        },
      );

      const data: ApiProfileResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Photo upload failed.');
      }

      const updatedProfile = data.user;

      if (!updatedProfile?.profilePhoto) {
        throw new Error(
          'Upload completed but no photo URL was returned.',
        );
      }

      setProfile(updatedProfile);
      setName(updatedProfile.name || '');
      setAbout(updatedProfile.about || '');
      setProfilePhoto(updatedProfile.profilePhoto);

      Alert.alert(
        'Success',
        'Profile photo uploaded and saved successfully.',
      );
    } catch (error) {
      Alert.alert(
        'Upload failed',
        error instanceof Error
          ? error.message
          : 'Could not upload your profile photo.',
      );
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }

    if (about.length > 150) {
      Alert.alert(
        'About too long',
        'About must be 150 characters or fewer.',
      );
      return;
    }

    if (
      profilePhoto.trim() &&
      !/^https?:\/\/\S+$/i.test(profilePhoto.trim())
    ) {
      Alert.alert(
        'Invalid photo URL',
        'Please enter a valid URL starting with http:// or https://.',
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${API_URL}/profile/${encodeURIComponent(userId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            about: about.trim(),
            profilePhoto: profilePhoto.trim(),
          }),
        },
      );

      const data: ApiProfileResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Could not update profile.');
      }

      const updatedProfile = data.user;

      if (!updatedProfile) {
        throw new Error(
          'Profile update returned an unexpected response.',
        );
      }

      setProfile(updatedProfile);
      setName(updatedProfile.name || '');
      setAbout(updatedProfile.about || '');
      setProfilePhoto(updatedProfile.profilePhoto || '');
      setEditing(false);

      Alert.alert('Success', 'Your profile has been updated.');
    } catch (error) {
      Alert.alert(
        'Update failed',
        error instanceof Error
          ? error.message
          : 'Could not update profile.',
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    if (!profile) {
      return;
    }

    setName(profile.name || '');
    setAbout(profile.about || '');
    setProfilePhoto(profile.profilePhoto || '');
    setEditing(false);
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
        <Text style={styles.errorText}>
          Profile could not be loaded.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={loadProfile}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const displayedPhoto = editing
    ? profilePhoto.trim()
    : profile.profilePhoto;

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
          onPress={() =>
            editing ? cancelEditing() : setEditing(true)
          }
          style={styles.editButton}
          disabled={saving || uploading}>
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
  <TouchableOpacity
    activeOpacity={0.9}
    onPress={() => setPhotoPreviewVisible(true)}
    accessibilityLabel="Open profile photo">
    <Image
      source={{uri: displayedPhoto}}
      style={styles.avatar}
      onError={() => {}}
    />
  </TouchableOpacity>
) : (
  <View style={styles.avatarPlaceholder}>
    <User size={48} color="#8338EC" />
  </View>
)}

            {editing && (
              <TouchableOpacity
                style={styles.cameraBadge}
                onPress={choosePhoto}
                disabled={uploading || saving}
                accessibilityLabel="Choose profile photo">
                <Camera size={17} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {editing && (
            <TouchableOpacity
              style={styles.choosePhotoButton}
              onPress={choosePhoto}
              disabled={uploading || saving}>
              {uploading ? (
                <ActivityIndicator size="small" color="#8338EC" />
              ) : (
                <Upload size={16} color="#8338EC" />
              )}

              <Text style={styles.choosePhotoText}>
                {uploading
                  ? 'Uploading photo...'
                  : 'Choose Profile Photo'}
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.profileName}>{profile.name}</Text>
          <Text style={styles.profileEmail}>{profile.email}</Text>
        </View>

        {/* Premium card */}
        <View style={styles.premiumCard}>
          <View style={styles.premiumHeading}>
            <View style={styles.premiumIcon}>
              <Crown size={22} color="#FFD166" />
            </View>

            <View style={styles.premiumTextWrap}>
              <Text style={styles.premiumTitle}>
                ChatApp Premium
              </Text>

              <Text style={styles.premiumSubtitle}>
                {profile.isPremium
                  ? `Premium active${
                      profile.premiumUntil
                        ? ` until ${new Date(
                            profile.premiumUntil,
                          ).toLocaleDateString()}`
                        : ''
                    }`
                  : 'Unlock your premium experience'}
              </Text>
            </View>
          </View>

          <View style={styles.premiumStatusRow}>
            <View
              style={[
                styles.activePremiumBadge,
                !profile.isPremium && styles.inactivePremiumBadge,
              ]}>
              <Text style={styles.activePremiumText}>
                {profile.isPremium ? 'PREMIUM ACTIVE' : 'FREE PLAN'}
              </Text>
            </View>
          </View>

          <Text style={styles.premiumDescription}>
            Test Mode — ₹10 test payment.
          </Text>

          <TouchableOpacity
            style={[
              styles.premiumButton,
              purchasingPremium && styles.disabledButton,
            ]}
            onPress={upgradeToPremium}
            disabled={
              purchasingPremium || saving || uploading
            }>
            {purchasingPremium ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Crown size={18} color="#fff" />
                <Text style={styles.premiumButtonText}>
                  {profile.isPremium
                    ? 'Test Another Payment'
                    : 'Upgrade to Premium · ₹10 (Test)'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Personal information */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Personal Information
          </Text>

          <Text style={styles.label}>Full Name</Text>

          <TextInput
            style={[
              styles.input,
              !editing && styles.readOnlyInput,
            ]}
            value={name}
            onChangeText={setName}
            editable={editing && !saving && !uploading}
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
            editable={editing && !saving && !uploading}
            placeholder="Write something about yourself..."
            multiline
            maxLength={150}
            textAlignVertical="top"
          />

          {editing && (
            <Text style={styles.characterCount}>
              {about.length}/150
            </Text>
          )}

          {editing && (
            <>
              <Text style={styles.label}>
                Profile Photo URL (optional)
              </Text>

              <TextInput
                style={styles.input}
                value={profilePhoto}
                onChangeText={setProfilePhoto}
                placeholder="https://example.com/photo.jpg"
                autoCapitalize="none"
                keyboardType="url"
                editable={!saving && !uploading}
              />

              <Text style={styles.hint}>
                Select a photo from your gallery, or paste an
                image URL. Gallery photos are uploaded to
                Cloudinary.
              </Text>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (saving || uploading) && styles.disabledButton,
                ]}
                onPress={saveProfile}
                disabled={saving || uploading}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Save size={18} color="#fff" />
                    <Text style={styles.primaryButtonText}>
                      Save Changes
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Logout button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={openLogoutModal}
          disabled={loggingOut}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Custom logout confirmation modal */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeLogoutModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.logoutModal}>
            <View style={styles.logoutIconCircle}>
              <ArrowLeft size={25} color="#8338EC" />
            </View>

            <Text style={styles.logoutTitle}>Logout?</Text>

            <Text style={styles.logoutMessage}>
              Are you sure you want to log out of your account?
            </Text>

            {logoutError ? (
              <Text style={styles.logoutError}>
                {logoutError}
              </Text>
            ) : null}

            <View style={styles.logoutActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeLogoutModal}
                disabled={loggingOut}>
                <Text style={styles.cancelButtonText}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmLogoutButton,
                  loggingOut && styles.disabledButton,
                ]}
                onPress={handleLogout}
                disabled={loggingOut}>
                {loggingOut ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmLogoutText}>
                    Logout
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
<Modal
  visible={photoPreviewVisible}
  transparent
  animationType="fade"
  statusBarTranslucent
  onRequestClose={() => setPhotoPreviewVisible(false)}>
  <View style={styles.photoPreviewOverlay}>
    <TouchableOpacity
      style={styles.photoPreviewClose}
      onPress={() => setPhotoPreviewVisible(false)}
      accessibilityLabel="Close photo preview">
      <Text style={styles.photoPreviewCloseText}>✕</Text>
    </TouchableOpacity>

    {displayedPhoto ? (
      <Image
        source={{uri: displayedPhoto}}
        style={styles.fullProfilePhoto}
        resizeMode="contain"
      />
    ) : null}
  </View>
</Modal>

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
  choosePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#EEE6FC',
    marginBottom: 14,
  },
  choosePhotoText: {
    color: '#8338EC',
    fontWeight: '600',
    fontSize: 13,
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
    lineHeight: 18,
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

  // Premium styles
  inactivePremiumBadge: {
    backgroundColor: '#EEE6FC',
  },
  premiumCard: {
    backgroundColor: '#251044',
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    elevation: 3,
  },
  premiumHeading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#49306A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  premiumTextWrap: {
    flex: 1,
  },
  premiumTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  premiumSubtitle: {
    color: '#D8C9F2',
    fontSize: 13,
    marginTop: 4,
  },
  premiumDescription: {
    color: '#E9DFF8',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
    marginBottom: 14,
  },
  premiumButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#8338EC',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
  },
  premiumButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  activePremiumBadge: {
    alignSelf: 'flex-start',
    marginTop: 14,
    borderRadius: 20,
    backgroundColor: '#D9FBE7',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activePremiumText: {
    color: '#166534',
    fontWeight: '800',
    fontSize: 12,
  },
  premiumStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },

photoPreviewOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0, 0, 0, 0.96)',
  justifyContent: 'center',
  alignItems: 'center',
},
photoPreviewClose: {
  position: 'absolute',
  top: 50,
  right: 24,
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: 'rgba(255, 255, 255, 0.15)',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1,
},
photoPreviewCloseText: {
  color: '#FFFFFF',
  fontSize: 25,
  fontWeight: '600',
},
fullProfilePhoto: {
  width: '100%',
  height: '80%',
},

  // Logout button
  logoutButton: {
    marginTop: 24,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#8338EC',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Logout modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoutModal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
  },
  logoutIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#EEE6FC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoutTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#222222',
  },
  logoutMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: '#666666',
    textAlign: 'center',
    marginTop: 10,
  },
  logoutError: {
    color: '#D32F2F',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  logoutActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#F1EDF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#333333',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmLogoutButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#8338EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLogoutText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ProfileScreen;
