
import React, {useState} from 'react';

import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';

import {SafeAreaView} from 'react-native-safe-area-context';
import {Mail, Lock} from 'lucide-react-native';

import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const PURPLE = '#8338EC';
const API_URL = 'https://chatapp-6xj8.onrender.com';

const LoginScreen = ({navigation}: Props) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Please enter your email and password.');
      return;
    }

    if (loading) {
      return;
    }

    setLoading(true);

    try {
      console.log('LOGIN: Request started');

      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const responseText = await response.text();

      console.log('LOGIN HTTP STATUS:', response.status);
      console.log('LOGIN RAW RESPONSE:', responseText);

      let data: {
        message?: string;
        userId?: string;
        name?: string;
        email?: string;
      };

      try {
        data = JSON.parse(responseText);
      } catch {
        console.log('LOGIN ERROR: Server returned non-JSON response');
        Alert.alert(
          'Server response error',
          'Backend returned an unexpected response. Check the Metro and backend terminal logs.',
        );
        return;
      }

      if (!response.ok) {
        Alert.alert(
          'Login failed',
          data.message || `Request failed (${response.status})`,
        );
        return;
      }

      if (!data.userId) {
        Alert.alert('Login failed', 'Server did not return a user ID.');
        return;
      }

      console.log('LOGIN SUCCESS:', data.userId);

      navigation.navigate('Home', {
        userId: data.userId,
      });
    } catch (error) {
      console.log('LOGIN NETWORK ERROR:', error);

      Alert.alert(
        'Connection error',
        'Could not reach the backend. Confirm your phone and laptop are on the same network and the backend is running.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor={PURPLE}
        translucent={false}
      />

      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <View style={styles.container}>
          <KeyboardAvoidingView
            style={styles.keyboardView}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              contentContainerStyle={styles.scrollContainer}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled">
              <View style={styles.brandContainer}>
                <Text style={styles.brandLogo}>ChatApp</Text>
                <Text style={styles.brandSubtitle}>
                  Stay Connected, Your Way
                </Text>
              </View>

              <View style={styles.formContainer}>
                <View style={styles.inputWrapper}>
                  <Mail size={20} color="#FFFFFF" />

                  <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    placeholderTextColor="#C4A1FF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    value={email}
                    onChangeText={setEmail}
                    editable={!loading}
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <Lock size={20} color="#FFFFFF" />

                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#C4A1FF"
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="current-password"
                    value={password}
                    onChangeText={setPassword}
                    editable={!loading}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.loginButton, loading && styles.disabledButton]}
                  onPress={handleLogin}
                  activeOpacity={0.8}
                  disabled={loading}>
                  <Text style={styles.loginButtonText}>
                    {loading ? 'Logging in...' : 'Log In'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.registerRedirect}
                  onPress={() => navigation.navigate('Register')}
                  activeOpacity={0.7}
                  disabled={loading}>
                  <Text style={styles.redirectText}>
                    Not a member?{' '}
                    <Text style={styles.boldUnderline}>Sign Up</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  container: {
    flex: 1,
    backgroundColor: PURPLE,
  },

  keyboardView: {
    flex: 1,
  },

  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },

  brandContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },

  brandLogo: {
    fontSize: 54,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1.5,
    fontStyle: 'italic',
  },

  brandSubtitle: {
    fontSize: 15,
    color: '#F4EFFF',
    marginTop: 10,
    textAlign: 'center',
    opacity: 0.9,
  },

  formContainer: {
    width: '100%',
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    marginBottom: 16,
    paddingHorizontal: 18,
    height: 58,
  },

  input: {
    flex: 1,
    height: '100%',
    color: '#FFFFFF',
    fontSize: 15,
    marginLeft: 10,
  },

  loginButton: {
    backgroundColor: '#FFFFFF',
    height: 58,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },

  disabledButton: {
    opacity: 0.65,
  },

  loginButtonText: {
    color: PURPLE,
    fontSize: 16,
    fontWeight: '700',
  },

  registerRedirect: {
    alignItems: 'center',
    marginTop: 22,
    paddingVertical: 10,
  },

  redirectText: {
    color: '#F4EFFF',
    fontSize: 14,
  },

  boldUnderline: {
    color: '#FFFFFF',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});

export default LoginScreen;

