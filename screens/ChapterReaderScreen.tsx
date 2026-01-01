import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Dimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StoryService } from '../services/storyService';
import { LibraryService } from '../services/libraryService';
import { RootStackParamList, StoredChapter, StoredStoryFile } from '../types';
import { SafeAreaView } from 'react-native-safe-area-context';

type ChapterReaderScreenProps = NativeStackScreenProps<RootStackParamList, 'ChapterReader'>;

export default function ChapterReaderScreen({ navigation, route }: ChapterReaderScreenProps) {
  const { storyName, chapterNumber } = route.params;
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [story, setStory] = useState<StoredStoryFile | null>(null);
  const [chapter, setChapter] = useState<StoredChapter | null>(null);
  const atBottomRef = useRef(false);
  const atTopRef = useRef(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const bottomSpacerHeight = useMemo(() => (Dimensions.get('window').height * 1) / 2, []);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedScrollPositionRef = useRef<number>(0);
  const shouldRestoreScrollRef = useRef(false);
  const saveScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const loadChapter = useCallback(async () => {
    try {
      setLoading(true);

      const savedStory = await LibraryService.getStory(storyName);
      setStory(savedStory);

      const foundChapter = savedStory.listChapter.find(ch => ch.id === chapterNumber) ?? null;
      if (!foundChapter) {
        throw new Error('Không tìm thấy chương trong danh sách đã lưu.');
      }

      setChapter(foundChapter);

      // Check if we're returning to the same chapter (has saved scroll position)
      const isSameChapter = savedStory.lastRead === foundChapter.id;
      if (isSameChapter && savedStory.lastScrollPosition && savedStory.lastScrollPosition > 0) {
        savedScrollPositionRef.current = savedStory.lastScrollPosition;
        shouldRestoreScrollRef.current = true;
      } else {
        savedScrollPositionRef.current = 0;
        shouldRestoreScrollRef.current = false;
      }

      await LibraryService.updateLastRead(storyName, foundChapter.id);

      const chapterContent = await StoryService.getChapterContent(foundChapter.url);
      setContent(chapterContent);
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không thể tải nội dung chương');
      setContent('Không thể tải nội dung chương này.');
      setChapter(null);
    } finally {
      setLoading(false);
    }
  }, [chapterNumber, storyName]);

  useEffect(() => {
    void loadChapter();
  }, [loadChapter]);

  useEffect(() => {
    shouldScrollToBottomRef.current = route.params?.startFromBottom === true;
  }, [route.params?.startFromBottom]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
      if (saveScrollTimeoutRef.current) {
        clearTimeout(saveScrollTimeoutRef.current);
        saveScrollTimeoutRef.current = null;
      }
    };
  }, []);

  const getNextChapterNumber = useCallback((): number | null => {
    if (!story) return null;
    const currentIndex = story.listChapter.findIndex(ch => ch.id === chapterNumber);
    if (currentIndex < 0) return null;
    const next = story.listChapter[currentIndex + 1];
    return next ? next.id : null;
  }, [chapterNumber, story]);

  const getPrevChapterNumber = useCallback((): number | null => {
    if (!story) return null;
    const currentIndex = story.listChapter.findIndex(ch => ch.id === chapterNumber);
    if (currentIndex <= 0) return null;
    const prev = story.listChapter[currentIndex - 1];
    return prev ? prev.id : null;
  }, [chapterNumber, story]);

  const hasNextChapter = useMemo(() => getNextChapterNumber() !== null, [getNextChapterNumber]);
  const hasPrevChapter = useMemo(() => getPrevChapterNumber() !== null, [getPrevChapterNumber]);

  const goNextChapter = useCallback(() => {
    const nextChapterNumber = getNextChapterNumber();
    if (!nextChapterNumber) {
      Alert.alert('Thông báo', 'Bạn đã đọc đến chương cuối cùng');
      return;
    }

    navigation.replace('ChapterReader', {
      storyName,
      chapterNumber: nextChapterNumber,
      startFromBottom: false,
    });
  }, [chapterNumber, getNextChapterNumber, navigation, storyName]);

  const goPrevChapter = useCallback(() => {
    const prevChapterNumber = getPrevChapterNumber();
    if (!prevChapterNumber) {
      // Already at first chapter, do nothing
      return;
    }

    navigation.replace('ChapterReader', {
      storyName,
      chapterNumber: prevChapterNumber,
      startFromBottom: true,
    });
  }, [chapterNumber, getPrevChapterNumber, navigation, storyName]);

  // Debounced save scroll position to storage
  const saveScrollPosition = useCallback(
    (pScrollY: number) => {
      if (saveScrollTimeoutRef.current) {
        clearTimeout(saveScrollTimeoutRef.current);
      }
      saveScrollTimeoutRef.current = setTimeout(() => {
        saveScrollTimeoutRef.current = null;
        void LibraryService.updateScrollPosition(storyName, pScrollY);
      }, 150); // Debounce 500ms to avoid too many writes
    },
    [storyName]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const paddingToBottom = 80;
      const paddingToTop = 20;

      const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
      const isAtTop = contentOffset.y <= paddingToTop;

      atBottomRef.current = isAtBottom;
      atTopRef.current = isAtTop;

      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }

      // Save scroll position (debounced)
      saveScrollPosition(contentOffset.y);
    },
    [saveScrollPosition]
  );

  const scheduleNavigation = useCallback((action: () => void) => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }
    transitionTimeoutRef.current = setTimeout(() => {
      transitionTimeoutRef.current = null;
      action();
    }, 1000);
  }, []);

  const handleContentSizeChange = useCallback(() => {
    // Priority 1: Scroll to bottom (when coming from next chapter)
    if (shouldScrollToBottomRef.current) {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
        shouldScrollToBottomRef.current = false;
        shouldRestoreScrollRef.current = false;
      });
      return;
    }

    // Priority 2: Restore saved scroll position
    if (shouldRestoreScrollRef.current && savedScrollPositionRef.current > 0) {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({
          y: savedScrollPositionRef.current,
          animated: false,
        });
        shouldRestoreScrollRef.current = false;
      });
    }
  }, []);

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const paddingToBottom = 80;
      const paddingToTop = 20;

      const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
      const isAtTop = contentOffset.y <= paddingToTop;

      atBottomRef.current = atBottomRef.current || isAtBottom;
      atTopRef.current = atTopRef.current || isAtTop;

      if (atBottomRef.current && hasNextChapter) {
        scheduleNavigation(goNextChapter);
        return;
      }

      if (atTopRef.current && hasPrevChapter) {
        scheduleNavigation(goPrevChapter);
        return;
      }
    },
    [goNextChapter, goPrevChapter, hasNextChapter, hasPrevChapter, scheduleNavigation]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Đang tải nội dung...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ImageBackground
            source={require('../paperboard-texture.jpg')}
            // style={styles.paragraphContainer}
            resizeMode="repeat"
          >
           <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.backButtonText}>‹</Text>
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              {/* <Text style={styles.storyName} numberOfLines={1}>
                {story?.caption ?? storyName}
              </Text> */}
              <Text style={styles.chapterTitle} numberOfLines={1}>
                {chapter ? chapter.name : `Chương ${chapterNumber}`}
              </Text>
            </View>
            {/* <TouchableOpacity
              style={styles.refreshButton}
              onPress={loadChapter}
            >
              <Text style={styles.refreshButtonText}>↻</Text>
            </TouchableOpacity> */}
        </View>
      </ImageBackground>

      <ScrollView
        style={styles.contentContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEndDrag}
        scrollEventThrottle={16}
        ref={scrollViewRef}
        onContentSizeChange={handleContentSizeChange}
      >
        {content.split('\n').map((paragraph, paraIndex) => (
          <ImageBackground
            key={paraIndex}
            source={require('../paperboard-texture.jpg')}
            style={styles.paragraphContainer}
            resizeMode="repeat"
          >
            <View style={styles.paragraphContent}>
              <Text style={styles.contentText}>{paragraph}</Text>
            </View>
          </ImageBackground>
        ))}
        <ImageBackground
            source={require('../paperboard-texture.jpg')}
            style={[styles.bottomSpacer, { height: bottomSpacerHeight }]}
            resizeMode="repeat"
          >
          </ImageBackground>
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    // paddingHorizontal: 15,
    // paddingVertical: 8,
    // backgroundColor: 'rgba(248, 249, 250, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  backButton: {
    // padding: 5,
  },
  backButtonText: {
    fontSize: 20,
    // color: '#007AFF',
    fontWeight: '800',
  },
  headerInfo: {
    flex: 1,
    marginHorizontal: 15,
  },
  storyName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  chapterTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  refreshButton: {
    padding: 5,
  },
  refreshButtonText: {
    fontSize: 18,
    color: '#007AFF',
  },
  contentContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 0,
  },
  paragraphContainer: {
    minHeight: 60,
  },
  paragraphContent: {
    padding: 15
  },
  contentText: {
    fontSize: 18,
    lineHeight: 28,
    color: '#2c1810',
    textAlign: 'justify',
    textAlignVertical: 'top',
    includeFontPadding: false,
  },
  bottomSpacer: {
    width: '100%',
  },
});
