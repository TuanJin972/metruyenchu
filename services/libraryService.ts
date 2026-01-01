import * as FileSystem from 'expo-file-system/legacy';
import { StoredStoryFile, StoredStoryIndexItem } from '../types';
import { StoryService } from './storyService';

const SOURCE_BASE_URL = 'https://metruyenchu.com.vn';

const LIBRARY_DIR = `${FileSystem.documentDirectory ?? ''}metruyenchu/`;
const STORIES_DIR = `${LIBRARY_DIR}stories/`;
const INDEX_FILE = `${LIBRARY_DIR}index.json`;

function normalizeStoryName(pValue: string): string {
  return pValue.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
}

function safeFileName(pValue: string): string {
  // Keep filename predictable and cross-platform safe.
  return normalizeStoryName(pValue).replace(/[^a-z0-9-_]+/g, '_');
}

export function parseStoryNameFromInput(pInput: string): string {
  const input = pInput.trim();
  if (!input) return '';

  // 1) Full URL (preferred)
  const urlMatch = input.match(/https?:\/\/[^/]*metruyenchu\.com\.vn\/([^/?#]+)/i);
  if (urlMatch?.[1]) return normalizeStoryName(urlMatch[1]);

  // 2) Path-like input: "/slug" or "slug/chuong-1..."
  const pathMatch = input.match(/^\/?([^/?#]+)(?:[/?#]|$)/);
  if (pathMatch?.[1]) return normalizeStoryName(pathMatch[1]);

  // 3) Raw slug
  return normalizeStoryName(input);
}

function getStoryFilePath(pStoryName: string): string {
  const safeName = safeFileName(pStoryName);
  return `${STORIES_DIR}${safeName}.json`;
}

async function ensureLibraryDirs(): Promise<void> {
  if (!FileSystem.documentDirectory) {
    throw new Error('Thiết bị không hỗ trợ lưu trữ file cục bộ (documentDirectory).');
  }
  await FileSystem.makeDirectoryAsync(STORIES_DIR, { intermediates: true });
}

async function readJsonFile<T>(pFilePath: string): Promise<T | null> {
  const info = await FileSystem.getInfoAsync(pFilePath);
  if (!info.exists) return null;

  const raw = await FileSystem.readAsStringAsync(pFilePath);
  if (!raw.trim()) return null;

  return JSON.parse(raw) as T;
}

async function writeJsonFile(pFilePath: string, pData: unknown): Promise<void> {
  const raw = JSON.stringify(pData, null, 2);
  await FileSystem.writeAsStringAsync(pFilePath, raw, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export class LibraryService {
  /**
   * Returns index list for Home screen (lightweight).
   */
  static async listStories(): Promise<StoredStoryIndexItem[]> {
    await ensureLibraryDirs();

    const index = await readJsonFile<StoredStoryIndexItem[]>(INDEX_FILE);
    if (!index || !Array.isArray(index)) return [];

    return [...index].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Returns a full story JSON file for Story Detail screen.
   */
  static async getStory(pStoryName: string): Promise<StoredStoryFile> {
    await ensureLibraryDirs();

    const storyName = normalizeStoryName(pStoryName);
    const filePath = getStoryFilePath(storyName);

    const story = await readJsonFile<StoredStoryFile>(filePath);
    if (!story) {
      throw new Error('Không tìm thấy truyện đã lưu. Vui lòng thêm lại truyện từ link.');
    }

    return story;
  }

  /**
   * Add a story from an input URL (or slug), then persist into local JSON file + index.
   */
  static async addStoryFromUrl(pInput: string): Promise<StoredStoryIndexItem> {
    await ensureLibraryDirs();

    const storyName = parseStoryNameFromInput(pInput);
    if (!storyName) {
      throw new Error('Vui lòng nhập link truyện hợp lệ.');
    }

    // Check if story already exists
    const existingStories = await this.listStories();
    const existingStory = existingStories.find(s => normalizeStoryName(s.name) === storyName);
    if (existingStory) {
      throw new Error('Truyện này đã được thêm vào thư viện rồi.');
    }

    const canonicalUrl = `${SOURCE_BASE_URL}/${storyName}`;
    const nowIso = new Date().toISOString();

    const story = await StoryService.getStoryChapters(storyName);

    const listChapter = story.chapters.map((ch, index) => ({
      id: index + 1, // Use 1-based index instead of ch.number to ensure uniqueness
      name: ch.title,
      url: ch.url,
    }));

    const storedStory: StoredStoryFile = {
      name: storyName,
      'storing-id': story.storingId,
      url: story.url ?? canonicalUrl,
      caption: story.name,
      description: story.description,
      image: story.image,
      listChapter,
      lastRead: listChapter.length > 0 ? 1 : 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const storyFilePath = getStoryFilePath(storyName);
    await writeJsonFile(storyFilePath, storedStory);

    const currentIndex = await this.listStories();
    const nextIndexItem: StoredStoryIndexItem = {
      name: storedStory.name,
      'storing-id': storedStory['storing-id'],
      url: storedStory.url,
      caption: storedStory.caption,
      image: storedStory.image,
      lastRead: storedStory.lastRead,
      totalChapters: storedStory.listChapter.length,
      updatedAt: storedStory.updatedAt,
    };

    const mergedIndex = [
      nextIndexItem,
      ...currentIndex.filter(it => normalizeStoryName(it.name) !== storyName),
    ];

    await writeJsonFile(INDEX_FILE, mergedIndex);
    return nextIndexItem;
  }

  /**
   * Re-fetch story info (caption/description/chapters) and update local JSON file.
   * Keeps lastRead when possible.
   */
  static async reloadStory(pStoryName: string): Promise<StoredStoryIndexItem> {
    await ensureLibraryDirs();

    const storyName = normalizeStoryName(pStoryName);
    const existing = await this.getStory(storyName);

    const nowIso = new Date().toISOString();
    const refreshed = await StoryService.getStoryChapters(storyName);

    const listChapter = refreshed.chapters.map((ch, index) => ({
      id: index + 1, // Use 1-based index instead of ch.number to ensure uniqueness
      name: ch.title,
      url: ch.url,
    }));

    const nextLastRead =
      listChapter.length === 0
        ? 0
        : Math.min(Math.max(existing.lastRead || 1, 1), listChapter.length);

    const nextStory: StoredStoryFile = {
      name: storyName,
      'storing-id': refreshed.storingId ?? existing['storing-id'],
      url: refreshed.url ?? existing.url,
      caption: refreshed.name,
      description: refreshed.description,
      image: refreshed.image ?? existing.image,
      listChapter,
      lastRead: nextLastRead,
      createdAt: existing.createdAt,
      updatedAt: nowIso,
    };

    const storyFilePath = getStoryFilePath(storyName);
    await writeJsonFile(storyFilePath, nextStory);

    const currentIndex = await this.listStories();
    const nextIndexItem: StoredStoryIndexItem = {
      name: nextStory.name,
      'storing-id': nextStory['storing-id'],
      url: nextStory.url,
      caption: nextStory.caption,
      image: nextStory.image,
      lastRead: nextStory.lastRead,
      totalChapters: nextStory.listChapter.length,
      updatedAt: nextStory.updatedAt,
    };

    const mergedIndex = [
      nextIndexItem,
      ...currentIndex.filter(it => normalizeStoryName(it.name) !== storyName),
    ];

    await writeJsonFile(INDEX_FILE, mergedIndex);
    return nextIndexItem;
  }

  /**
   * Update lastRead in story file and index.
   */
  static async updateLastRead(pStoryName: string, pChapterNumber: number): Promise<void> {
    await ensureLibraryDirs();

    const storyName = normalizeStoryName(pStoryName);
    const story = await this.getStory(storyName);

    if (!Number.isFinite(pChapterNumber) || pChapterNumber <= 0) return;

    const capped = Math.min(pChapterNumber, story.listChapter.length || pChapterNumber);
    if (story.lastRead === capped) return;

    const nowIso = new Date().toISOString();
    const nextStory: StoredStoryFile = {
      ...story,
      lastRead: capped,
      // Reset scroll position when changing chapters
      lastScrollPosition: 0,
      updatedAt: nowIso,
    };

    const storyFilePath = getStoryFilePath(storyName);
    await writeJsonFile(storyFilePath, nextStory);

    const currentIndex = await this.listStories();
    const mergedIndex = currentIndex.map(it => {
      if (normalizeStoryName(it.name) !== storyName) return it;
      return {
        ...it,
        lastRead: capped,
        updatedAt: nowIso,
      };
    });

    await writeJsonFile(INDEX_FILE, mergedIndex);
  }

  /**
   * Update scroll position for current chapter (does not update index or timestamps).
   */
  static async updateScrollPosition(pStoryName: string, pScrollPosition: number): Promise<void> {
    await ensureLibraryDirs();

    const storyName = normalizeStoryName(pStoryName);
    const story = await this.getStory(storyName);

    if (!Number.isFinite(pScrollPosition) || pScrollPosition < 0) return;

    // Only write if position changed significantly (avoid frequent writes)
    const currentPos = story.lastScrollPosition ?? 0;
    if (Math.abs(currentPos - pScrollPosition) < 50) return;

    const nextStory: StoredStoryFile = {
      ...story,
      lastScrollPosition: pScrollPosition,
    };

    const storyFilePath = getStoryFilePath(storyName);
    await writeJsonFile(storyFilePath, nextStory);
  }

  /**
   * Get scroll position for current chapter.
   */
  static async getScrollPosition(pStoryName: string): Promise<number> {
    await ensureLibraryDirs();

    const storyName = normalizeStoryName(pStoryName);
    const story = await this.getStory(storyName);

    return story.lastScrollPosition ?? 0;
  }
}


