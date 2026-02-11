import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  useColorScheme,
  Alert,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Dimensions,
  FlatList,
  ViewToken,
  Modal,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChapterCacheService } from '../services/chapterCacheService';
import { LibraryService } from '../services/libraryService';
import { ReaderFontId, ReaderSettingsService } from '../services/readerSettingsService';
import { RootStackParamList, StoredChapter, StoredStoryFile } from '../types';
import { SafeAreaView } from 'react-native-safe-area-context';

type ChapterReaderScreenProps = NativeStackScreenProps<RootStackParamList, 'ChapterReader'>;

interface ChapterData {
  chapter: StoredChapter;
  index: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const gChapterListItemHeight = 70;

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
  pOnToggleSettings,
  pFontFamily,
  pBackgroundColor,
  pContentTextColor,
  pSecondaryTextColor,
}: {
  pChapter: StoredChapter;
  pStoryName: string;
  pOnScrollPositionChange?: (pScrollY: number) => void;
  pInitialScrollPosition?: number;
  pBottomSpacerHeight: number;
    pOnToggleSettings: () => void;
    pFontFamily?: string;
    pBackgroundColor: string;
    pContentTextColor: string;
    pSecondaryTextColor: string;
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
      <View style={[styles.chapterLoadingContainer, { backgroundColor: pBackgroundColor }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.loadingText, { color: pSecondaryTextColor }]}>Đang tải...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      style={[styles.chapterScrollView, { backgroundColor: pBackgroundColor }]}
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
      <Pressable onPress={pOnToggleSettings}>
        <View style={styles.paragraphContent}>
          <Text style={[styles.contentText, { fontFamily: pFontFamily, color: pContentTextColor }]}>
            {formattedContent}
          </Text>
        </View>
        <View style={[styles.bottomSpacer, { height: pBottomSpacerHeight }]} />
      </Pressable>
      {/* </ImageBackground> */}
    </ScrollView>
  );
});

export default function ChapterReaderScreen({ navigation, route }: ChapterReaderScreenProps) {
  const { storyName, chapterNumber } = route.params;

  // Auto dark mode based on system theme.
  const gColorScheme = useColorScheme();
  const gIsDarkMode = gColorScheme === 'dark';
  const gReaderBackgroundColor = gIsDarkMode ? '#272729' : PAPER_BG_COLOR;
  const gReaderContentTextColor = gIsDarkMode ? '#8c8c8e' : '#2c1810';
  const gReaderSecondaryTextColor = gIsDarkMode ? '#8c8c8e' : '#666';
  const gReaderHeaderBorderColor = gIsDarkMode ? '#272729' : '#a99c82';
  const gReaderHeaderTextColor = gIsDarkMode ? '#8c8c8e' : '#333';

  const [story, setStory] = useState<StoredStoryFile | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(-1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [savedScrollPosition, setSavedScrollPosition] = useState<number>(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [chapterListVisible, setChapterListVisible] = useState(false);
  const [selectedFontId, setSelectedFontId] = useState<ReaderFontId>(ReaderSettingsService.DEFAULT_FONT_ID);
  const [fontsLoaded, setFontsLoaded] = useState(false);

  const flatListRef = useRef<FlatList<ChapterData>>(null);
  const chapterListRef = useRef<FlatList<StoredChapter>>(null);
  const saveScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedChapterRef = useRef<number>(-1);
  const gIsProgrammaticJumpRef = useRef(false);

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
      if (gIsProgrammaticJumpRef.current) {
        return;
      }
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
            pOnToggleSettings={() => setSettingsVisible(true)}
            pFontFamily={ReaderSettingsService.getFontFamily(selectedFontId)}
            pBackgroundColor={gReaderBackgroundColor}
            pContentTextColor={gReaderContentTextColor}
            pSecondaryTextColor={gReaderSecondaryTextColor}
          />
        </View>
      );
    },
    [
      currentChapterIndex,
      storyName,
      saveScrollPosition,
      savedScrollPosition,
      bottomSpacerHeight,
      selectedFontId,
      gReaderBackgroundColor,
      gReaderContentTextColor,
      gReaderSecondaryTextColor,
    ]
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

  const getChapterListItemLayout = useCallback(
    (_: ArrayLike<StoredChapter> | null | undefined, pIndex: number) => ({
      length: gChapterListItemHeight,
      offset: gChapterListItemHeight * pIndex,
      index: pIndex,
    }),
    []
  );

  const handleOpenChapterList = useCallback(() => {
    setChapterListVisible(true);
    setSettingsVisible(false);
  }, []);

  const handleCloseChapterList = useCallback(() => {
    setChapterListVisible(false);
  }, []);

  const handleSelectChapter = useCallback(
    (pChapter: StoredChapter, pIndex: number) => {
      if (!story) return;
      gIsProgrammaticJumpRef.current = true;
      setChapterListVisible(false);
      setSettingsVisible(false);
      setSavedScrollPosition(0);
      setCurrentChapterIndex(pIndex);
      lastSavedChapterRef.current = pChapter.id;
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToIndex({ index: pIndex, animated: false });
        gIsProgrammaticJumpRef.current = false;
      });
      void LibraryService.updateLastRead(storyName, pChapter.id);
      void ChapterCacheService.preloadChaptersAround(storyName, pChapter.id, story.listChapter);
    },
    [story, storyName]
  );

  const renderChapterListItem = useCallback(
    ({ item, index }: { item: StoredChapter; index: number }) => {
      const isActive = currentChapter?.id === item.id;
      return (
        <TouchableOpacity
          style={[
            gIsDarkMode ? styles.chapterListItemDark : styles.chapterListItem,
            isActive && (gIsDarkMode ? styles.chapterListItemActiveDark : styles.chapterListItemActive)
          ]}
          onPress={() => handleSelectChapter(item, index)}
        >
          <View style={styles.chapterListRow}>
            <Text style={[
              gIsDarkMode ? styles.chapterListNumberDark : styles.chapterListNumber,
              isActive && (gIsDarkMode ? styles.chapterListNumberActiveDark : styles.chapterListNumberActive)
            ]}>{item.id}</Text>
            <Text
              style={[
                gIsDarkMode ? styles.chapterListNameDark : styles.chapterListName,
                isActive && (gIsDarkMode ? styles.chapterListNameActiveDark : styles.chapterListNameActive)
              ]}
              numberOfLines={2}
            >
              {item.name}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [currentChapter?.id, handleSelectChapter, gIsDarkMode]
  );

  const handleFontSelect = useCallback(async (pFontId: ReaderFontId) => {
    try {
      setSelectedFontId(pFontId);
      await ReaderSettingsService.setFontId(pFontId);
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể lưu font chữ này. Vui lòng thử lại.');
    }
  }, []);

  useEffect(() => {
    const loadFont = async () => {
      try {
        await ReaderSettingsService.ensureFontsLoaded();
        setFontsLoaded(true);

        const gSavedFontId = await ReaderSettingsService.getFontId();
        setSelectedFontId(gSavedFontId);
      } catch (error) {
        console.warn('Unable to load saved font', error);
      }
    };

    void loadFont();
  }, []);

  if (initialLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: gReaderBackgroundColor }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.loadingText, { color: gReaderSecondaryTextColor }]}>
          Đang tải nội dung...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: gReaderBackgroundColor }]}>
      {/* <ImageBackground
        source={require('../paperboard-texture.jpg')}
        resizeMode="repeat"
      > */}
      <View style={[styles.header, { borderBottomColor: gReaderHeaderBorderColor, backgroundColor: gReaderBackgroundColor }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.backButtonText, { color: gReaderHeaderTextColor }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={[styles.chapterTitle, { color: gReaderHeaderTextColor }]} numberOfLines={1}>
            {currentChapter ? currentChapter.name : `Chương ${chapterNumber}`}
          </Text>
        </View>
        <View style={styles.chapterIndicator}>
          <Text style={[styles.chapterIndicatorText, { color: gReaderSecondaryTextColor }]}>
            {currentChapterIndex + 1}/{story?.listChapter.length ?? 0}
          </Text>
        </View>
      </View>
      {/* </ImageBackground> */}

      <FlatList
        ref={flatListRef}
        data={chapterData}
        extraData={{ selectedFontId, fontsLoaded }}
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

      <Modal visible={settingsVisible} transparent animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setSettingsVisible(false)}>
          <View style={[styles.settingsOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.4)' }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.settingsSheet, { backgroundColor: '#fff' }]}>
                <View style={[styles.settingsHandle, { backgroundColor: gIsDarkMode ? '#555' : '#e0e0e0' }]} />
                <Text style={[styles.settingsTitle, { color: gReaderHeaderTextColor }]}>Settings</Text>

                <TouchableOpacity
                  style={[styles.settingsButton, { backgroundColor: '#007AFF' }]}
                  onPress={handleOpenChapterList}
                >
                  <Text style={[styles.settingsButtonText, { color: '#fff' }]}>Danh sách chương</Text>
                </TouchableOpacity>

                <Text style={[styles.settingsSectionTitle, { color: gReaderHeaderTextColor }]}>Font chữ</Text>
                <View style={styles.fontList}>
                  {ReaderSettingsService.AVAILABLE_FONTS.map(font => (
                    <TouchableOpacity
                      key={font.id}
                      style={[
                        gIsDarkMode ? styles.fontOptionDark : styles.fontOption,
                        selectedFontId === font.id && (gIsDarkMode ? styles.fontOptionActiveDark : styles.fontOptionActive)
                      ]}
                      onPress={() => handleFontSelect(font.id)}
                    >
                      <Text
                        style={[
                          gIsDarkMode ? styles.fontOptionTextDark : styles.fontOptionText,
                          selectedFontId === font.id && (gIsDarkMode ? styles.fontOptionTextActiveDark : styles.fontOptionTextActive),
                          { fontFamily: font.fontFamily },
                        ]}
                      >
                        {font.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={chapterListVisible} animationType="slide" onRequestClose={handleCloseChapterList}>
        <SafeAreaView style={[styles.chapterListModal, { backgroundColor: gReaderBackgroundColor }]}>
          <View style={[styles.chapterListHeader, { borderBottomColor: gReaderHeaderBorderColor }]}>
            <Text style={[styles.chapterListTitle, { color: gReaderHeaderTextColor }]}>Danh sách chương</Text>
            <TouchableOpacity onPress={handleCloseChapterList}>
              <Text style={[styles.chapterListClose, { color: '#007AFF' }]}>Đóng</Text>
            </TouchableOpacity>
          </View>
          {story ? (
            <FlatList
              ref={chapterListRef}
              data={story.listChapter}
              keyExtractor={item => `chapter-modal-${item.id}`}
              renderItem={renderChapterListItem}
              showsVerticalScrollIndicator={false}
              initialScrollIndex={currentChapterIndex >= 0 ? currentChapterIndex : undefined}
              getItemLayout={getChapterListItemLayout}
              initialNumToRender={18}
              maxToRenderPerBatch={24}
              windowSize={9}
              removeClippedSubviews={true}
              onScrollToIndexFailed={({ index }) => {
                setTimeout(() => {
                  chapterListRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 });
                }, 100);
              }}
            />
          ) : (
            <View style={styles.chapterListEmpty}>
              <Text style={gIsDarkMode ? styles.chapterListEmptyTextDark : styles.chapterListEmptyText}>Không có danh sách chương.</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
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
  settingsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    justifyContent: 'flex-end',
  },
  settingsSheet: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  settingsHandle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#e0e0e0',
    alignSelf: 'center',
    marginBottom: 12,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  settingsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 8,
  },
  settingsButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  settingsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fontList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  fontOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  fontOptionActive: {
    backgroundColor: '#e8f0ff',
    borderColor: '#007AFF',
  },
  fontOptionText: {
    fontSize: 14,
    color: '#333',
  },
  fontOptionTextActive: {
    color: '#007AFF',
    fontWeight: '700',
  },
  chapterListModal: {
    flex: 1,
    backgroundColor: '#fff',
  },
  chapterListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  chapterListTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  chapterListClose: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  chapterListItem: {
    height: gChapterListItemHeight,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  chapterListItemActive: {
    backgroundColor: '#e8f0ff',
  },
  chapterListRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  chapterListNumber: {
    width: 52,
    fontSize: 14,
    paddingRight: 12,
    color: '#333',
  },
  chapterListNumberActive: {
    color: '#007AFF',
    fontWeight: '700',
  },
  chapterListName: {
    flex: 1,
    flexShrink: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  chapterListNameActive: {
    color: '#007AFF',
    fontWeight: '700',
  },
  chapterListEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterListEmptyText: {
    fontSize: 15,
    color: '#666',
  },
  chapterListEmptyTextDark: {
    fontSize: 15,
    color: '#8c8c8e',
  },

  // Dark mode styles for chapter list
  chapterListItemDark: {
    height: gChapterListItemHeight,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  chapterListItemActiveDark: {
    backgroundColor: '#333',
  },
  chapterListNumberDark: {
    width: 52,
    fontSize: 14,
    paddingRight: 12,
    color: '#8c8c8e',
  },
  chapterListNumberActiveDark: {
    color: '#007AFF',
    fontWeight: '700',
  },
  chapterListNameDark: {
    flex: 1,
    flexShrink: 1,
    fontSize: 14,
    color: '#8c8c8e',
    lineHeight: 20,
  },
  chapterListNameActiveDark: {
    color: '#007AFF',
    fontWeight: '700',
  },

  // Dark mode styles for font options
  fontOptionDark: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#555',
  },
  fontOptionActiveDark: {
    backgroundColor: '#333',
    borderColor: '#007AFF',
  },
  fontOptionTextDark: {
    fontSize: 14,
    color: '#8c8c8e',
  },
  fontOptionTextActiveDark: {
    color: '#007AFF',
    fontWeight: '700',
  },
});
