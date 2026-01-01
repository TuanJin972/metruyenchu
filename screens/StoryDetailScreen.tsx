import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, StoredChapter, StoredStoryFile } from '../types';
import { LibraryService } from '../services/libraryService';
import { StoryService } from '../services/storyService';
import { SafeAreaView } from 'react-native-safe-area-context';

type StoryDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'StoryDetail'>;

export default function StoryDetailScreen({ navigation, route }: StoryDetailScreenProps) {
  const { storyName } = route.params;

  const [story, setStory] = useState<StoredStoryFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [activeTab, setActiveTab] = useState<'intro' | 'chapters'>('intro');

  const flatListRef = useRef<FlatList<StoredChapter> | null>(null);
  const lastReadIndex = useMemo(() => {
    if (!story) return -1;
    const targetId = story.lastRead > 0 ? story.lastRead : story.listChapter[0]?.id;
    return story.listChapter.findIndex(ch => ch.id === targetId);
  }, [story]);

  const loadStory = useCallback(async () => {
    try {
      setLoading(true);
      const saved = await LibraryService.getStory(storyName);
      setStory(saved);
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không thể tải truyện đã lưu.');
      setStory(null);
    } finally {
      setLoading(false);
    }
  }, [storyName]);

  useEffect(() => {
    void loadStory();
    const unsubscribe = navigation.addListener('focus', () => {
      void loadStory();
    });
    return unsubscribe;
  }, [navigation, loadStory]);

  const handleRead = () => {
    if (!story || story.listChapter.length === 0) {
      Alert.alert('Thông báo', 'Truyện chưa có danh sách chương.');
      return;
    }

    const targetChapterNumber = story.lastRead > 0 ? story.lastRead : story.listChapter[0].id;
    navigation.navigate('ChapterReader', {
      storyName: story.name,
      chapterNumber: targetChapterNumber,
    });
  };

  const handleReload = async () => {
    try {
      setReloading(true);
      await LibraryService.reloadStory(storyName);
      await loadStory();
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không thể cập nhật truyện.');
    } finally {
      setReloading(false);
    }
  };

  const handleChapterPress = (chapter: StoredChapter) => {
    navigation.navigate('ChapterReader', {
      storyName: storyName,
      chapterNumber: chapter.id,
    });
  };

  const ITEM_HEIGHT = 70; // padding 15*2 + 2 lines of text ~40

  const getItemLayout = useCallback(
    (_data: ArrayLike<StoredChapter> | null | undefined, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  const onTabPress = useCallback(
    (tab: 'intro' | 'chapters') => {
      setActiveTab(tab);
    },
    []
  );

  const renderChapter = ({ item }: { item: StoredChapter }) => {
    const isLastRead = story?.lastRead === item.id;
    return (
      <TouchableOpacity style={[styles.chapterItem]} onPress={() => handleChapterPress(item)}>
        <View style={styles.chapterContent}>
          <Text style={[styles.chapterNumber, isLastRead && styles.lastReadItem]}>{item.id}</Text>
          <Text style={[styles.chapterTitle, isLastRead && styles.lastReadItem]} numberOfLines={2}>
            {item.name}
          </Text>
        </View>
        {/* <View style={styles.arrow}>
          <Text style={styles.arrowText}>›</Text>
        </View> */}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Đang tải truyện...</Text>
      </SafeAreaView>
    );
  }

  if (!story) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Không tìm thấy truyện.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryButtonText}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const descriptionText = story.description ? StoryService.formatHtmlToText(story.description) : '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {story.image && (
          <Image source={{ uri: story.image }} style={styles.storyImage} />
        )}
        <Text style={styles.storyTitle}>{story.caption}</Text>
        <Text style={styles.metaText}>
          {story.listChapter.length} chương • Đang đọc: {story.lastRead > 0 ? `Chương ${story.lastRead}` : 'Chưa đọc'}
        </Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleRead}>
            <Text style={styles.primaryButtonText}>Read</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, reloading && styles.buttonDisabled]}
            onPress={handleReload}
            disabled={reloading}
          >
            {reloading ? <ActivityIndicator color="#007AFF" /> : <Text style={styles.secondaryButtonText}>Reload</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'intro' && styles.tabItemActive]}
          onPress={() => onTabPress('intro')}
        >
          <Text style={[styles.tabText, activeTab === 'intro' && styles.tabTextActive]}>Giới thiệu</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'chapters' && styles.tabItemActive]}
          onPress={() => onTabPress('chapters')}
        >
          <Text style={[styles.tabText, activeTab === 'chapters' && styles.tabTextActive]}>Danh sách chương</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'intro' ? (
        <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.tabBody}>
            {!!descriptionText ? (
              <>
                <Text style={styles.descriptionTitle}>Giới thiệu:</Text>
                <Text style={styles.descriptionText}>{descriptionText}</Text>
              </>
            ) : (
              <Text style={styles.descriptionText}>Chưa có nội dung giới thiệu.</Text>
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={[styles.tabBody, styles.listWrapper]}>
          <FlatList
            ref={flatListRef}
            data={story.listChapter}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={renderChapter}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContainer}
            getItemLayout={getItemLayout}
            initialScrollIndex={lastReadIndex >= 0 ? lastReadIndex : undefined}
            onScrollToIndexFailed={({ index }) => {
              const wait = new Promise(resolve => setTimeout(resolve, 100));
              wait.then(() => {
                flatListRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 });
              });
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContainer: {
    paddingVertical: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  storyImage: {
    width: 120,
    height: 160,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 15,
  },
  storyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 6,
  },
  metaText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 15,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  descriptionContainer: {
    width: '100%',
  },
  descriptionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  descriptionText: {
    fontSize: 16,
    color: '#555',
    lineHeight: 24,
    textAlign: 'justify',
  },
  chapterItem: {
    backgroundColor: '#fff',
    padding: 15,
    height: 70,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  lastReadItem: {
    fontWeight: '600',
    // borderWidth: 2,
    // borderColor: '#007AFF',
  },
  chapterContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  chapterNumber: {
    fontSize: 14,
    // fontWeight: '600',
    // color: '#007AFF',
    paddingRight: 14,
  },
  chapterTitle: {
    flex: 1,
    flexShrink: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e6e6e6',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  tabItemActive: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#555',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  tabBody: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e6e6e6',
  },
  bodyScroll: {
    flex: 1,
  },
  bodyScrollContent: {
    padding: 15,
    paddingBottom: 24,
  },
  listWrapper: {
    flex: 1,
    padding: 0,
    marginHorizontal: 15,
    marginBottom: 24,
  },
  arrow: {
    marginLeft: 10,
  },
  arrowText: {
    fontSize: 24,
    color: '#ccc',
    fontWeight: '300',
  },
});


