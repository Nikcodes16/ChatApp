
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
} from 'react-native';
import * as Keychain from 'react-native-keychain';

import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import ChatRoom from '../screens/ChatRoom';
import ProfileScreen from '../screens/ProfileScreen';
import CallsScreen from '../screens/CallsScreen';
import HomeDashboardScreen from '../screens/HomeDashboardScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: {
    userId: string;
  };
  ChatRoom: {
    name: string;
    currentUserId: string;
    chatUserId: string;
  };
  Profile: {
    userId: string;
  };
  Calls: {
    userId: string;
  };
  Dashboard: {
    userId: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator = () => {
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);

  useEffect(() => {
    const checkSavedLogin = async () => {
      try {
        const credentials = await Keychain.getGenericPassword({
          service: 'com.chatapp.auth',
        });

        // username mein userId aur password mein JWT token save hoga.
        if (
          credentials !== false &&
          credentials.password &&
          credentials.username &&
          credentials.username !== 'authToken'
        ) {
          setSavedUserId(credentials.username);
        }
      } catch (error) {
        console.error('Saved login check failed:', error);
      } finally {
        setCheckingLogin(false);
      }
    };

    checkSavedLogin();
  }, []);

  if (checkingLogin) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8338EC" />
        <Text style={styles.loadingText}>Checking login...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={savedUserId ? 'Home' : 'Login'}
        screenOptions={{headerShown: false}}>
        <Stack.Screen name="Login" component={LoginScreen} />

        <Stack.Screen name="Register" component={RegisterScreen} />

        <Stack.Screen
          name="Home"
          component={HomeScreen}
          initialParams={
            savedUserId ? {userId: savedUserId} : undefined
          }
        />

        <Stack.Screen name="ChatRoom" component={ChatRoom} />

        <Stack.Screen name="Profile" component={ProfileScreen} />

        <Stack.Screen name="Calls" component={CallsScreen} />

        <Stack.Screen
          name="Dashboard"
          component={HomeDashboardScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F7FC',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
});

export default AppNavigator;
