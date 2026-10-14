import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {User, Mail, Lock, Eye, EyeOff} from 'lucide-react-native';

import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

const PURPLE = '#8338EC';

const RegisterScreen = ({navigation}: Props) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

const handleRegister = async () => {
  try {
    const response = await fetch('https://chatapp-6xj8.onrender.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.log('Registration failed:', data.message);
      return;
    }

    console.log('REGISTRATION SUCCESS:', data);

    navigation.navigate('Login');
  } catch (error) {
    console.log('Registration error:', error);
  }
};

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE} />

      <View style={styles.content}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Create your account to get started</Text>

        {/* Name */}
        <View style={styles.inputContainer}>
          <User size={20} color="#ffffff" />

          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
          />
        </View>

        {/* Email */}
        <View style={styles.inputContainer}>
          <Mail size={20} color="#ffffff" />

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        {/* Password */}
        <View style={styles.inputContainer}>
          <Lock size={20} color="#ffffff" />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}>
            {showPassword ? (
              <EyeOff size={20} color="#ffffff" />
            ) : (
              <Eye size={20} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Register */}
        <TouchableOpacity
          style={styles.registerButton}
          onPress={handleRegister}>
          <Text style={styles.registerText}>Register</Text>
        </TouchableOpacity>

        {/* Login */}
        <View style={styles.loginRow}>
          <Text style={styles.accountText}>Already have an account? </Text>

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginText}>Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PURPLE,
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 15,
    color: '#eee',
    textAlign: 'center',
    marginBottom: 35,
  },

  inputContainer: {
    height: 55,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    marginBottom: 16,
    paddingHorizontal: 18,
    
  },

  input: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    marginLeft: 10,
  },

  registerButton: {
    height: 55,
    backgroundColor: '#fff',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },

  registerText: {
    color: PURPLE,
    fontSize: 17,
    fontWeight: 'bold',
  },

  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 25,
  },

  accountText: {
    color: '#eee',
    fontSize: 14,
  },

  loginText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default RegisterScreen;