
import React from 'react';
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
  Calls: undefined;
  Dashboard: { userId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{headerShown: false}}
        />

        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{headerShown: false}}
        />

        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{headerShown: false}}
        />

        <Stack.Screen
          name="ChatRoom"
          component={ChatRoom}
          options={{headerShown: false}}
        />

        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{headerShown: false}}
        />

        <Stack.Screen
          name="Calls"
          component={CallsScreen}
          options={{headerShown: false}}
        />
        <Stack.Screen
  name="Dashboard"
  component={HomeDashboardScreen}
/>
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;