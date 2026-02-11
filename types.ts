export interface Chapter {
  id: string;
  title: string;
  url: string;
  number: number;
}

export interface Story {
  id: string;
  name: string;
  chapters: Chapter[];
  /**
   * Story description (raw HTML from source site).
   * UI should convert this to readable text before rendering.
   */
  description?: string;
  /**
   * Canonical story URL.
   */
  url?: string;
  /**
   * Numeric ID parsed from source paging (if available).
   */
  storingId?: number;
  /**
   * Story cover image URL.
   */
  image?: string;
}

export interface StoredChapter {
  id: number;
  name: string;
  url: string;
}

/** Source site identifier */
export type StorySource = 'metruyenchu' | 'tiemtruyenchu';

export interface StoredStoryFile {
  name: string;
  'storing-id'?: number;
  url: string;
  caption: string;
  description?: string;
  image?: string;
  /** Source site for this story (defaults to 'metruyenchu' for backward compatibility) */
  source?: StorySource;
  listChapter: StoredChapter[];
  lastRead: number;
  /** Scroll position (y offset) for the last read chapter */
  lastScrollPosition?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredStoryIndexItem {
  name: string;
  'storing-id'?: number;
  url: string;
  caption: string;
  image?: string;
  /** Source site for this story (defaults to 'metruyenchu' for backward compatibility) */
  source?: StorySource;
  lastRead: number;
  totalChapters: number;
  updatedAt: string;
}

export type RootStackParamList = {
  Home: undefined;
  StoryDetail: { storyName: string };
  ChapterReader: { storyName: string; chapterNumber: number; startFromBottom?: boolean };
};
