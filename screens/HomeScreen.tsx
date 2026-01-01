import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LibraryService } from '../services/libraryService';
import { RootStackParamList, StoredStoryIndexItem } from '../types';

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const [storyUrl, setStoryUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [stories, setStories] = useState<StoredStoryIndexItem[]>([]);

  const loadStories = useCallback(async () => {
    try {
      setLoadingList(true);
      const list = await LibraryService.listStories();
      setStories(list);
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không thể tải danh sách truyện.');
      setStories([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadStories();
    const unsubscribe = navigation.addListener('focus', () => {
      void loadStories();
    });
    return unsubscribe;
  }, [navigation, loadStories]);

  const handleAddStory = async () => {
    if (!storyUrl.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập link truyện');
      return;
    }

    setAdding(true);
    try {
      const added = await LibraryService.addStoryFromUrl(storyUrl.trim());
      setStoryUrl('');
      await loadStories();
      navigation.navigate('StoryDetail', { storyName: added.name });
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Có lỗi xảy ra khi thêm truyện');
    } finally {
      setAdding(false);
    }
  };

  const handleOpenStory = (story: StoredStoryIndexItem) => {
    navigation.navigate('StoryDetail', { storyName: story.name });
  };

  const renderHeader = () => (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Thư viện truyện</Text>
        <Text style={styles.subtitle}>Thêm truyện từ link metruyenchu.com.vn</Text>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Link truyện:</Text>
        <TextInput
          style={styles.input}
          value={storyUrl}
          onChangeText={setStoryUrl}
          placeholder="Ví dụ: https://metruyenchu.com.vn/mat-the-de-nhat-ngoan-nhan"
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Bạn có thể dán link hoặc nhập slug (mat-the-de-nhat-ngoan-nhan)</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, adding && styles.buttonDisabled]}
        onPress={handleAddStory}
        disabled={adding}
      >
        {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Thêm Truyện</Text>}
      </TouchableOpacity>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Danh sách truyện đã thêm</Text>
      </View>
    </View>
  );

  const renderStoryItem = ({ item }: { item: StoredStoryIndexItem }) => (
    <TouchableOpacity style={styles.storyItem} onPress={() => handleOpenStory(item)}>
      {item.image && (
        <Image source={{ uri: item.image }} style={styles.storyImage} />
      )}
      <View style={styles.storyContent}>
        <Text style={styles.storyTitle} numberOfLines={3}>
          {item.caption}
        </Text>
        <Text style={styles.storyMeta} numberOfLines={1}>
          Đang đọc: {item.lastRead > 0 ? `Chương ${item.lastRead}` : 'Chưa đọc'} • {item.totalChapters} chương
        </Text>
      </View>
      <View style={styles.arrow}>
        <Text style={styles.arrowText}>›</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <FlatList
        data={stories}
        keyExtractor={(item, index) => `${item.name}-${index}`}
        renderItem={renderStoryItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshing={loadingList}
        onRefresh={loadStories}
        ListEmptyComponent={
          loadingList ? null : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Bạn chưa thêm truyện nào.</Text>
            </View>
          )
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 30,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  input: {
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  hint: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 30,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  sectionHeader: {
    marginTop: 5,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  storyItem: {
    backgroundColor: '#fff',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  storyImage: {
    width: 60,
    height: 80,
    borderRadius: 4,
    marginRight: 12,
  },
  storyContent: {
    flex: 1,
  },
  storyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  storyMeta: {
    fontSize: 14,
    color: '#666',
  },
  arrow: {
    marginLeft: 10,
  },
  arrowText: {
    fontSize: 24,
    color: '#ccc',
    fontWeight: '300',
  },
  emptyState: {
    paddingVertical: 30,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
  },
});
