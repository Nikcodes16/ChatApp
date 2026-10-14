
import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ArrowLeft, Phone} from 'lucide-react-native';

const CallsScreen = ({navigation}: any) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <ArrowLeft size={23} color="#222" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Calls</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Phone size={38} color="#8338EC" />
        </View>

        <Text style={styles.title}>Calls</Text>
        <Text style={styles.subtitle}>Coming Soon!</Text>
        <Text style={styles.description}>
          Voice and video calling features will be available in a future update.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F7FC',
  },
  header: {
    height: 58,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 35,
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#EDE3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    color: '#222',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8338EC',
    marginTop: 10,
  },
  description: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 10,
  },
});

export default CallsScreen;