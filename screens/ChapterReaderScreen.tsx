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
  FlatList,
  ViewToken,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChapterCacheService } from '../services/chapterCacheService';
import { LibraryService } from '../services/libraryService';
import { RootStackParamList, StoredChapter, StoredStoryFile } from '../types';
import { SafeAreaView } from 'react-native-safe-area-context';

type ChapterReaderScreenProps = NativeStackScreenProps<RootStackParamList, 'ChapterReader'>;

interface ChapterData {
  chapter: StoredChapter;
  index: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Individual chapter content component
 * Renders the content of a single chapter with scroll support
 */
const ChapterContent = React.memo(({
  pChapter,
  pStoryName,
  pOnScrollPositionChange,
  pInitialScrollPosition,
  pBottomSpacerHeight,
}: {
  pChapter: StoredChapter;
  pStoryName: string;
  pOnScrollPositionChange?: (pScrollY: number) => void;
  pInitialScrollPosition?: number;
  pBottomSpacerHeight: number;
}) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasRestoredScroll = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const loadContent = async () => {
      try {
        setLoading(true);
        const chapterContent = await ChapterCacheService.getChapterContent(
          pStoryName,
          pChapter.id,
          pChapter.url
        );
        if (isMounted) {
          setContent(chapterContent);
        }
      } catch (error) {
        if (isMounted) {
          setContent('Không thể tải nội dung chương này.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadContent();

    return () => {
      isMounted = false;
    };
  }, [pChapter.id, pChapter.url, pStoryName]);

  const handleContentSizeChange = useCallback(() => {
    // Restore scroll position if provided and not already restored
    if (!hasRestoredScroll.current && pInitialScrollPosition && pInitialScrollPosition > 0) {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({
          y: pInitialScrollPosition,
          animated: false,
        });
        hasRestoredScroll.current = true;
      });
    }
  }, [pInitialScrollPosition]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset } = event.nativeEvent;
      pOnScrollPositionChange?.(contentOffset.y);
    },
    [pOnScrollPositionChange]
  );

  // Pre-format content with proper paragraph spacing
  const formattedContent = useMemo(() => {
    if (!content) return '';
    return content.split('\n').filter(p => p.trim()).join('\n\n');
  }, [content]);

  if (loading) {
    return (
      <View style={styles.chapterLoadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Đang tải...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.chapterScrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      bounces={false}
      alwaysBounceVertical={false}
      onScroll={handleScroll}
      scrollEventThrottle={100}
      onContentSizeChange={handleContentSizeChange}
      nestedScrollEnabled={true}
      removeClippedSubviews={true}
    >
      {/* <ImageBackground
        source={require('../paperboard-texture.jpg')}
        style={styles.contentBackground}
        resizeMode="repeat"
      > */}
      <View style={styles.paragraphContent}>
        <Text style={styles.contentText}>{formattedContent}</Text>
      </View>
      <View style={[styles.bottomSpacer, { height: pBottomSpacerHeight }]} />
      {/* </ImageBackground> */}
    </ScrollView>
  );
});

export default function ChapterReaderScreen({ navigation, route }: ChapterReaderScreenProps) {
  const { storyName, chapterNumber } = route.params;
  const [story, setStory] = useState<StoredStoryFile | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(-1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [savedScrollPosition, setSavedScrollPosition] = useState<number>(0);

  const flatListRef = useRef<FlatList<ChapterData>>(null);
  const saveScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedChapterRef = useRef<number>(-1);

  const bottomSpacerHeight = useMemo(() => (SCREEN_HEIGHT * 1) / 2, []);

  // Prepare chapter data for FlatList
  const chapterData = useMemo((): ChapterData[] => {
    if (!story) return [];
    return story.listChapter.map((chapter, index) => ({
      chapter,
      index,
    }));
  }, [story]);

  // Load story and initial chapter
  useEffect(() => {
    const loadStory = async () => {
      try {
        setInitialLoading(true);
        const savedStory = await LibraryService.getStory(storyName);

        const chapterIndex = savedStory.listChapter.findIndex(ch => ch.id === chapterNumber);
        if (chapterIndex < 0) {
          throw new Error('Không tìm thấy chương trong danh sách đã lưu.');
        }

        // Check for saved scroll position
        const isSameChapter = savedStory.lastRead === chapterNumber;
        if (isSameChapter && savedStory.lastScrollPosition && savedStory.lastScrollPosition > 0) {
          setSavedScrollPosition(savedStory.lastScrollPosition);
        }

        // Preload current chapter FIRST before showing FlatList
        const currentChapterData = savedStory.listChapter[chapterIndex];
        await ChapterCacheService.getChapterContent(
          storyName,
          currentChapterData.id,
          currentChapterData.url
        );

        // Set state after current chapter is loaded
        setStory(savedStory);
        setCurrentChapterIndex(chapterIndex);

        // Start preloading chapters around current (background)
        void ChapterCacheService.preloadChaptersAround(
          storyName,
          chapterNumber,
          savedStory.listChapter
        );
      } catch (error) {
        Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không thể tải nội dung');
        navigation.goBack();
      } finally {
        setInitialLoading(false);
      }
    };

    void loadStory();

    return () => {
      if (saveScrollTimeoutRef.current) {
        clearTimeout(saveScrollTimeoutRef.current);
      }
    };
  }, [chapterNumber, storyName, navigation]);

  // Memoize initial scroll index to prevent re-renders
  const initialScrollIndex = useMemo(() => {
    // Only return valid index when data is ready
    if (currentChapterIndex >= 0 && chapterData.length > 0) {
      return currentChapterIndex;
    }
    return undefined;
  }, [currentChapterIndex, chapterData.length]);

  // Handle chapter change when scrolling between chapters
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const visibleItem = viewableItems[0];
        const newChapterData = visibleItem.item as ChapterData;
        const newChapterId = newChapterData.chapter.id;

        // Only update if chapter actually changed
        if (lastSavedChapterRef.current !== newChapterId) {
          lastSavedChapterRef.current = newChapterId;
          setCurrentChapterIndex(newChapterData.index);

          // Update last read
          void LibraryService.updateLastRead(storyName, newChapterId);

          // Preload chapters around the new current chapter
          if (story) {
            void ChapterCacheService.preloadChaptersAround(
              storyName,
              newChapterId,
              story.listChapter
            );
          }
        }
      }
    },
    [storyName, story]
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 100,
    }),
    []
  );

  // Debounced save scroll position
  const saveScrollPosition = useCallback(
    (pScrollY: number) => {
      if (saveScrollTimeoutRef.current) {
        clearTimeout(saveScrollTimeoutRef.current);
      }
      saveScrollTimeoutRef.current = setTimeout(() => {
        void LibraryService.updateScrollPosition(storyName, pScrollY);
      }, 300);
    },
    [storyName]
  );

  // Get current chapter info
  const currentChapter = useMemo(() => {
    if (!story || currentChapterIndex < 0) return null;
    return story.listChapter[currentChapterIndex];
  }, [story, currentChapterIndex]);

  // Render individual chapter page
  const renderChapterPage = useCallback(
    ({ item, index }: { item: ChapterData; index: number }) => {
      const isCurrentChapter = index === currentChapterIndex;
      return (
        <View style={styles.chapterPage}>
          <ChapterContent
            pChapter={item.chapter}
            pStoryName={storyName}
            pOnScrollPositionChange={isCurrentChapter ? saveScrollPosition : undefined}
            pInitialScrollPosition={isCurrentChapter ? savedScrollPosition : undefined}
            pBottomSpacerHeight={bottomSpacerHeight}
          />
        </View>
      );
    },
    [currentChapterIndex, storyName, saveScrollPosition, savedScrollPosition, bottomSpacerHeight]
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<ChapterData> | null | undefined, index: number) => ({
      length: SCREEN_WIDTH,
      offset: SCREEN_WIDTH * index,
      index,
    }),
    []
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      // Scroll to a nearby index first, then try again
      flatListRef.current?.scrollToIndex({
        index: Math.max(0, info.highestMeasuredFrameIndex),
        animated: false,
      });
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: info.index,
          animated: false,
        });
      }, 100);
    },
    []
  );

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Đang tải nội dung...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* <ImageBackground
        source={require('../paperboard-texture.jpg')}
        resizeMode="repeat"
      > */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.chapterTitle} numberOfLines={1}>
            {currentChapter ? currentChapter.name : `Chương ${chapterNumber}`}
          </Text>
        </View>
        <View style={styles.chapterIndicator}>
          <Text style={styles.chapterIndicatorText}>
            {currentChapterIndex + 1}/{story?.listChapter.length ?? 0}
          </Text>
        </View>
      </View>
      {/* </ImageBackground> */}

      <FlatList
        ref={flatListRef}
        data={chapterData}
        renderItem={renderChapterPage}
        keyExtractor={item => `chapter-${item.chapter.id}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={getItemLayout}
        initialScrollIndex={initialScrollIndex}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews={true}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        style={styles.flatList}
      />
    </SafeAreaView>
  );
}

// Background color matching the paperboard texture for seamless transitions
const PAPER_BG_COLOR = '#b7ac97';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAPER_BG_COLOR,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PAPER_BG_COLOR,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#a99c82',
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  backButton: {},
  backButtonText: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerInfo: {
    flex: 1,
    marginHorizontal: 15,
  },
  chapterTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  chapterIndicator: {
    // backgroundColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chapterIndicatorText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  flatList: {
    flex: 1,
  },
  chapterPage: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  chapterLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PAPER_BG_COLOR,
  },
  chapterScrollView: {
    flex: 1,
    backgroundColor: PAPER_BG_COLOR,
  },
  scrollContent: {
    flexGrow: 1,
  },
  contentBackground: {
    minHeight: '100%',
  },
  paragraphContent: {
    padding: 15,
    paddingTop: 20,
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
