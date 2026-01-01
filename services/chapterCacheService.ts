import { StoryService } from './storyService';
import { StoredChapter } from '../types';

interface CachedChapter {
  chapterId: number;
  content: string;
  loadedAt: number;
}

/**
 * Chapter Cache Service
 * - Caches chapter content in memory for smooth reading experience
 * - Preloads next 5 chapters and keeps previous 5 chapters
 * - Automatically cleans up chapters outside the cache window
 */
class ChapterCacheServiceClass {
  private gCache: Map<string, CachedChapter> = new Map();
  private gLoadingPromises: Map<string, Promise<string>> = new Map();
  private gPreloadSessionId = 0;
  private static readonly PRELOAD_AHEAD = 5; // Number of chapters to preload ahead
  private static readonly KEEP_BEHIND = 5; // Number of previous chapters to keep

  /**
   * Generate a unique cache key for a chapter
   */
  private getCacheKey(pStoryName: string, pChapterId: number): string {
    return `${pStoryName}:${pChapterId}`;
  }

  /**
   * Get chapter content from cache or load it
   */
  async getChapterContent(
    pStoryName: string,
    pChapterId: number,
    pChapterUrl: string
  ): Promise<string> {
    const cacheKey = this.getCacheKey(pStoryName, pChapterId);

    // Check if already cached
    const cached = this.gCache.get(cacheKey);
    if (cached) {
      return cached.content;
    }

    // Check if already loading
    const loadingPromise = this.gLoadingPromises.get(cacheKey);
    if (loadingPromise) {
      return loadingPromise;
    }

    // Start loading
    const promise = this.loadChapter(pStoryName, pChapterId, pChapterUrl);
    this.gLoadingPromises.set(cacheKey, promise);

    try {
      const content = await promise;
      return content;
    } finally {
      this.gLoadingPromises.delete(cacheKey);
    }
  }

  /**
   * Load a chapter and cache it
   */
  private async loadChapter(
    pStoryName: string,
    pChapterId: number,
    pChapterUrl: string
  ): Promise<string> {
    const cacheKey = this.getCacheKey(pStoryName, pChapterId);

    try {
      const content = await StoryService.getChapterContent(pChapterUrl);

      this.gCache.set(cacheKey, {
        chapterId: pChapterId,
        content,
        loadedAt: Date.now(),
      });

      return content;
    } catch (error) {
      console.error(`Error loading chapter ${pChapterId}:`, error);
      throw error;
    }
  }

  /**
   * Preload chapters around the current chapter
   * Loads next PRELOAD_AHEAD chapters and ensures KEEP_BEHIND previous chapters are kept
   */
  async preloadChaptersAround(
    pStoryName: string,
    pCurrentChapterId: number,
    pChapterList: StoredChapter[]
  ): Promise<void> {
    const gCurrentSessionId = ++this.gPreloadSessionId;
    const currentIndex = pChapterList.findIndex(ch => ch.id === pCurrentChapterId);
    if (currentIndex < 0) return;

    // Calculate range to preload
    const startIndex = Math.max(0, currentIndex - ChapterCacheServiceClass.KEEP_BEHIND);
    const endIndex = Math.min(
      pChapterList.length - 1,
      currentIndex + ChapterCacheServiceClass.PRELOAD_AHEAD
    );

    // Preload chapters in the range (prioritize ahead chapters)
    const chaptersToPreload: StoredChapter[] = [];

    // First add ahead chapters (priority)
    for (let i = currentIndex + 1; i <= endIndex; i++) {
      chaptersToPreload.push(pChapterList[i]);
    }

    // Then add behind chapters
    for (let i = currentIndex - 1; i >= startIndex; i--) {
      chaptersToPreload.push(pChapterList[i]);
    }

    // Preload sequentially to avoid spamming the server when users jump chapters quickly.
    for (const chapter of chaptersToPreload) {
      if (gCurrentSessionId !== this.gPreloadSessionId) {
        return;
      }
      const cacheKey = this.getCacheKey(pStoryName, chapter.id);

      // Skip if already cached or loading
      if (this.gCache.has(cacheKey) || this.gLoadingPromises.has(cacheKey)) {
        continue;
      }

      try {
        await this.loadChapter(pStoryName, chapter.id, chapter.url);
      } catch (error) {
        console.warn(`Background preload failed for chapter ${chapter.id}:`, error);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clean up chapters outside the cache window
    if (gCurrentSessionId !== this.gPreloadSessionId) {
      return;
    }
    this.cleanupCache(pStoryName, pChapterList, currentIndex);
  }

  /**
   * Clean up chapters outside the cache window (5 behind, 5 ahead)
   */
  private cleanupCache(
    pStoryName: string,
    pChapterList: StoredChapter[],
    pCurrentIndex: number
  ): void {
    const startIndex = Math.max(0, pCurrentIndex - ChapterCacheServiceClass.KEEP_BEHIND);
    const endIndex = Math.min(
      pChapterList.length - 1,
      pCurrentIndex + ChapterCacheServiceClass.PRELOAD_AHEAD
    );

    // Get valid chapter IDs in range
    const validChapterIds = new Set<number>();
    for (let i = startIndex; i <= endIndex; i++) {
      validChapterIds.add(pChapterList[i].id);
    }

    // Remove chapters outside range for this story
    const keysToDelete: string[] = [];
    for (const [key, cached] of this.gCache.entries()) {
      if (key.startsWith(`${pStoryName}:`)) {
        if (!validChapterIds.has(cached.chapterId)) {
          keysToDelete.push(key);
        }
      }
    }

    for (const key of keysToDelete) {
      this.gCache.delete(key);
      console.log(`Cleaned up cache: ${key}`);
    }
  }

  /**
   * Check if a chapter is cached
   */
  isChapterCached(pStoryName: string, pChapterId: number): boolean {
    const cacheKey = this.getCacheKey(pStoryName, pChapterId);
    return this.gCache.has(cacheKey);
  }

  /**
   * Check if a chapter is currently loading
   */
  isChapterLoading(pStoryName: string, pChapterId: number): boolean {
    const cacheKey = this.getCacheKey(pStoryName, pChapterId);
    return this.gLoadingPromises.has(cacheKey);
  }

  /**
   * Clear all cache for a specific story
   */
  clearStoryCache(pStoryName: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.gCache.keys()) {
      if (key.startsWith(`${pStoryName}:`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.gCache.delete(key);
    }

    // Also clear loading promises
    for (const key of this.gLoadingPromises.keys()) {
      if (key.startsWith(`${pStoryName}:`)) {
        this.gLoadingPromises.delete(key);
      }
    }

    console.log(`Cleared cache for story: ${pStoryName}`);
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.gCache.clear();
    this.gLoadingPromises.clear();
    console.log('Cleared all chapter cache');
  }

  /**
   * Get cache stats for debugging
   */
  getCacheStats(): { totalCached: number; storyBreakdown: Record<string, number> } {
    const storyBreakdown: Record<string, number> = {};

    for (const key of this.gCache.keys()) {
      const storyName = key.split(':')[0];
      storyBreakdown[storyName] = (storyBreakdown[storyName] || 0) + 1;
    }

    return {
      totalCached: this.gCache.size,
      storyBreakdown,
    };
  }
}

export const ChapterCacheService = new ChapterCacheServiceClass();

