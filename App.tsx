import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './screens/HomeScreen';
import StoryDetailScreen from './screens/StoryDetailScreen';
import ChapterReaderScreen from './screens/ChapterReaderScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Đọc Truyện Online' }}
        />
        <Stack.Screen
          name="StoryDetail"
          component={StoryDetailScreen}
          options={{ title: 'Chi tiết truyện' }}
        />
        <Stack.Screen
          name="ChapterReader"
          component={ChapterReaderScreen}
          options={{ title: 'Đọc chương' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}