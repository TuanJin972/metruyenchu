import axios from 'axios';
import { Chapter, Story } from '../types';

const BASE_URL = 'https://metruyenchu.com.vn';
const TIEM_BASE_URL = 'https://www.tiemtruyenchu.com';

/* --------------------------------------------------
   Utils
-------------------------------------------------- */

/**
 * Sleep / delay (ms)
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Decode HTML entities to regular characters
 */
const decodeHtmlEntities = (text: string): string => {
  const entities: { [key: string]: string } = {
    '&#224;': 'à', '&#225;': 'á', '&#226;': 'â', '&#227;': 'ã', '&#228;': 'ä', '&#229;': 'å',
    '&#232;': 'è', '&#233;': 'é', '&#234;': 'ê', '&#235;': 'ë',
    '&#236;': 'ì', '&#237;': 'í', '&#238;': 'î', '&#239;': 'ï',
    '&#242;': 'ò', '&#243;': 'ó', '&#244;': 'ô', '&#245;': 'õ', '&#246;': 'ö',
    '&#249;': 'ù', '&#250;': 'ú', '&#251;': 'û', '&#252;': 'ü',
    '&#253;': 'ý', '&#254;': 'þ', '&#255;': 'ÿ',
    '&#192;': 'À', '&#193;': 'Á', '&#194;': 'Â', '&#195;': 'Ã', '&#196;': 'Ä', '&#197;': 'Å',
    '&#200;': 'È', '&#201;': 'É', '&#202;': 'Ê', '&#203;': 'Ë',
    '&#204;': 'Ì', '&#205;': 'Í', '&#206;': 'Î', '&#207;': 'Ï',
    '&#210;': 'Ò', '&#211;': 'Ó', '&#212;': 'Ô', '&#213;': 'Õ', '&#214;': 'Ö',
    '&#217;': 'Ù', '&#218;': 'Ú', '&#219;': 'Û', '&#220;': 'Ü',
    '&#221;': 'Ý', '&#222;': 'Þ', '&#223;': 'ß',
    '&agrave;': 'à', '&aacute;': 'á', '&acirc;': 'â', '&atilde;': 'ã', '&auml;': 'ä', '&aring;': 'å',
    '&egrave;': 'è', '&eacute;': 'é', '&ecirc;': 'ê', '&euml;': 'ë',
    '&igrave;': 'ì', '&iacute;': 'í', '&icirc;': 'î', '&iuml;': 'ï',
    '&ograve;': 'ò', '&oacute;': 'ó', '&ocirc;': 'ô', '&otilde;': 'õ', '&ouml;': 'ö',
    '&ugrave;': 'ù', '&uacute;': 'ú', '&ucirc;': 'û', '&uuml;': 'ü',
    '&yacute;': 'ý', '&thorn;': 'þ', '&yuml;': 'ÿ',
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
    '&hellip;': '…', '&mdash;': '—', '&ndash;': '–', '&lsquo;': "'", '&rsquo;': "'", '&ldquo;': '"', '&rdquo;': '"'
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }
  return decoded;
};

/* --------------------------------------------------
   Parse paging HTML
-------------------------------------------------- */

/**
 * Extract STORY_ID và maxPage từ paging HTML
 */
function extractStoryIdAndMaxPage(html: string): { storyId: number; maxPage: number } {
  console.log('Extracting story ID and max page from:', html.substring(0, 300));

  // 1️⃣ Lấy riêng block paging - match both single and double quotes
  const pagingBlockMatch = html.match(
    /<div[^>]*class=["'][^"']*paging[^"']*["'][^>]*>([\s\S]*?)<\/div>/
  );

  if (!pagingBlockMatch) {
    console.log('No paging div found');
    throw new Error('Không tìm thấy <div class="paging">');
  }

  const pagingHtml = pagingBlockMatch[1];
  console.log('Extracted paging HTML:', pagingHtml.substring(0, 200));

  // 2️⃣ Parse page(storyId, page)
  const regex = /page\((\d+),\s*(\d+)\)/g;

  let storyId: number | null = null;
  let maxPage = 1;

  let match;
  while ((match = regex.exec(pagingHtml)) !== null) {
    const id = Number(match[1]);
    const page = Number(match[2]);

    if (!storyId) storyId = id;
    if (page > maxPage) maxPage = page;
  }

  console.log('Parsed storyId:', storyId, 'maxPage:', maxPage);

  if (!storyId) {
    throw new Error('Không parse được STORY_ID trong paging');
  }

  return { storyId, maxPage };
}

/* --------------------------------------------------
   Fetch single page
-------------------------------------------------- */

/**
 * Fetch HTML danh sách chapter của 1 page
 */
async function fetchChapterPage(storyId: number, page: number): Promise<string> {
  const url = `${BASE_URL}/get/listchap/${storyId}?page=${page}`;
  console.log(`Fetching chapter page: ${url}`);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!res.ok) {
    console.error(`Fetch page ${page} failed: ${res.status}`);
    throw new Error(`Fetch page ${page} failed: ${res.status}`);
  }

  const json = await res.json();
  console.log(`Fetched page ${page}, response length: ${json.data?.length || 0}`);

  // json.data là HTML
  return json.data;
}

/* --------------------------------------------------
   Parse chapters from HTML
-------------------------------------------------- */

/**
 * Parse danh sách chapter từ HTML page
 */
function parseChaptersFromHtml(html: string): Chapter[] {
  const chapters: Chapter[] = [];

  // Remove paging section to avoid parsing page links as chapters
  const contentHtml = html.replace(/<div[^>]*class=["']paging["'][^>]*>[\s\S]*?<\/div>/gi, '');

  console.log('Parsing chapters from HTML length:', contentHtml.length);

  // Look for chapter links specifically (those containing "chuong-" in href and "Chương" in title)
  const regex = /<a[^>]*href=["']([^"']*chuong-[^"']*)["'][^>]*>(Chương\s+\d+:[^<]*)<\/a>/gi;

  let match;
  let matchCount = 0;
  while ((match = regex.exec(contentHtml)) !== null) {
    matchCount++;
    const url = match[1];
    const title = decodeHtmlEntities(match[2].trim());

    // Extract chapter number from title (e.g., "Chương 1: ..." -> 1)
    const chapterMatch = title.match(/Chương\s+(\d+)/i);
    const chapterNumber = chapterMatch ? parseInt(chapterMatch[1]) : chapters.length + 1;

    chapters.push({
      id: url.split('/').pop() || `chapter-${chapters.length}`,
      title,
      url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
      number: chapterNumber
    });
  }

  console.log(`Parsed ${matchCount} chapter links, created ${chapters.length} chapters`);
  return chapters;
}

/* --------------------------------------------------
   Fetch all pages
-------------------------------------------------- */

/**
 * Fetch toàn bộ danh sách chapter (theo paging HTML)
 */
async function fetchAllChapterPages(pagingHtml: string, options: { delay?: number } = {}): Promise<{
  storyId: number;
  totalPages: number;
  pages: { page: number; html: string }[];
}> {
  const { delay = 300 } = options;

  const { storyId, maxPage } = extractStoryIdAndMaxPage(pagingHtml);

  const pages: { page: number; html: string }[] = [];

  for (let page = 1; page <= maxPage; page++) {
    console.log(`Fetching page ${page}/${maxPage}`);

    const html = await fetchChapterPage(storyId, page);

    pages.push({
      page,
      html,
    });

    if (page < maxPage) {
      await sleep(delay);
    }
  }

  return {
    storyId,
    totalPages: maxPage,
    pages,
  };
}

/* --------------------------------------------------
   High-level helper (1 call là ra hết)
-------------------------------------------------- */

/**
 * Fetch + parse toàn bộ chapter list
 */
async function fetchAllChapters(pagingHtml: string, options: { delay?: number } = {}): Promise<{
  storyId: number;
  totalPages: number;
  totalChapters: number;
  chapters: Chapter[];
}> {
  const result = await fetchAllChapterPages(pagingHtml, options);

  const allChapters: Chapter[] = [];

  for (const p of result.pages) {
    const chapters = parseChaptersFromHtml(p.html);
    console.log(`Page ${p.page}: parsed ${chapters.length} chapters`);
    allChapters.push(...chapters);
  }

  console.log(`Total chapters from all pages: ${allChapters.length}`);
  return {
    storyId: result.storyId,
    totalPages: result.totalPages,
    totalChapters: allChapters.length,
    chapters: allChapters,
  };
}

export class StoryService {
  static async getStoryChapters(storyName: string): Promise<Story> {
    try {
      const url = `${BASE_URL}/${storyName}`;
      console.log('Fetching:', url);

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const html = response.data;
      const chapters: Chapter[] = [];

      // Parse story info from HTML
      let storyTitle = storyName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      let storyDescriptionHtml = '';

      // Extract story title from h1 tag
      const titleMatch = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
      if (titleMatch && titleMatch[1]) {
        storyTitle = decodeHtmlEntities(titleMatch[1].trim());
      }

      // Extract description from itemprop="description"
      const descMatch = html.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
      if (descMatch && descMatch[1]) {
        // Decode HTML entities from description
        storyDescriptionHtml = decodeHtmlEntities(descMatch[1].trim());
      }

      // Extract story image from book-info-pic div
      let storyImage = '';
      const imageMatch = html.match(/<div[^>]*class=["']book-info-pic["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']*)["'][^>]*>/i);
      if (imageMatch && imageMatch[1]) {
        storyImage = imageMatch[1].startsWith('http') ? imageMatch[1] : `${BASE_URL}${imageMatch[1]}`;
      }

      // Check if there's paging HTML - if yes, fetch all chapters via API
      console.log('Checking for paging HTML...');
      console.log('HTML contains "paging":', html.includes('paging'));
      console.log('HTML contains "page(":', html.includes('page('));

      // Try multiple patterns to find paging
      let pagingMatch = html.match(/<div[^>]*class=["'][^"']*paging[^"']*["'][^>]*>([\s\S]*?)<\/div>/);
      if (!pagingMatch) {
        // Try alternative pattern - maybe class is different
        pagingMatch = html.match(/<div[^>]*class="[^"]*paging[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      }
      if (!pagingMatch) {
        // Try even broader search for paging class
        pagingMatch = html.match(/class="[^"]*paging[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      }
      if (!pagingMatch) {
        // Last resort: find any div containing "page(" function calls
        const pageIndex = html.indexOf('page(');
        if (pageIndex !== -1) {
          // Find the start of the div containing this
          const divStart = html.lastIndexOf('<div', pageIndex);
          const divEnd = html.indexOf('</div>', pageIndex) + 6;
          if (divStart !== -1 && divEnd !== -1) {
            const divContent = html.substring(divStart, divEnd);
            pagingMatch = [divContent, divContent];
            console.log('Found paging by searching for page( function');
          }
        }
      }

      if (pagingMatch && pagingMatch[1]) {
        console.log('Found paging HTML, fetching all chapters via API...');
        console.log('Paging HTML content (first 200 chars):', pagingMatch[1].substring(0, 200));
        try {
          const pagingHtml = `<div class="paging">${pagingMatch[1]}</div>`;
          const result = await fetchAllChapters(pagingHtml, { delay: 300 });
          console.log(`Fetched ${result.totalChapters} chapters from ${result.totalPages} pages`);

          // Sort chapters by number
          result.chapters.sort((a, b) => a.number - b.number);

          const story: Story = {
            id: storyName,
            name: storyTitle,
            chapters: result.chapters,
            description: storyDescriptionHtml || undefined,
            url,
            storingId: result.storyId,
            image: storyImage || undefined,
          };

          return story;
        } catch (error) {
          console.error('Error fetching via paging API:', error);
          console.log('Falling back to regular parsing...');
          // Fall back to regular parsing if paging fails
        }
      } else {
        console.log('No paging HTML found, using regular parsing');
      }

      // Parse chapters from HTML - first try to find the chapter-list div
      console.log('HTML length:', html.length);
      console.log('HTML contains "chapter-list":', html.includes('chapter-list'));
      console.log('HTML contains "Danh sách chương":', html.includes('Danh sách chương'));

      // Try multiple approaches to find chapter list
      let chapterListHtml = '';

      // Approach 1: Find div with id="chapter-list"
      const chapterListMatch = html.match(/<div[^>]*id="chapter-list"[^>]*>([\s\S]*?)<\/div>/i);
      if (chapterListMatch && chapterListMatch[1]) {
        chapterListHtml = chapterListMatch[1];
        console.log('Found chapter-list div, length:', chapterListHtml.length);
      } else {
        console.log('chapter-list div not found with regex');
        // Approach 2: Find content between "Danh sách chương" and some end marker
        const danhSachIndex = html.indexOf('Danh sách chương');
        if (danhSachIndex !== -1) {
          console.log('Found "Danh sách chương" at index:', danhSachIndex);
          // Look for chapter links after this text
          const afterDanhSach = html.substring(danhSachIndex);
          const chapterListStart = afterDanhSach.indexOf('<div');
          const chapterListEnd = afterDanhSach.indexOf('</div>', chapterListStart) + 6;
          if (chapterListStart !== -1 && chapterListEnd !== -1) {
            chapterListHtml = afterDanhSach.substring(chapterListStart, chapterListEnd);
            console.log('Extracted chapter list HTML, length:', chapterListHtml.length);
          }
        }
      }

      if (chapterListHtml) {
        console.log('First 200 chars of chapter list:', chapterListHtml.substring(0, 200));

        // Parse chapters from the chapter list HTML
        // Simple approach: find all links containing "/chuong-"
        const linkPattern = /href=["']([^"']*\/chuong-[^"']*)["'][^>]*>([^<]*Chương\s+\d+:[^<]*)<\/a>/gi;
        let match;
        let index = 0;

        while ((match = linkPattern.exec(chapterListHtml)) !== null) {
          const href = match[1];
          const title = decodeHtmlEntities(match[2].trim());

          if (href && title) {
            // Extract chapter number from title (e.g., "Chương 1: ..." -> 1)
            const chapterMatch = title.match(/Chương\s+(\d+)/i);
            const chapterNumber = chapterMatch ? parseInt(chapterMatch[1]) : index + 1;

            chapters.push({
              id: href.split('/').pop() || `chapter-${index}`,
              title,
              url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
              number: chapterNumber
            });
          }
          index++;
        }

        console.log('Parsed chapters count:', chapters.length);
      }

      // If still no chapters found, try the broader search
      if (chapters.length === 0) {
        console.log('No chapters found in chapter-list div, trying broader search...');
        const chapterRegex = /<li[^>]*>\s*<a[^>]*href=["']([^"']*\/chuong-[^"']*)["'][^>]*>(Chương\s+\d+:[^<]*)<\/a>\s*<\/li>/gi;

        let match;
        let index = 0;

        while ((match = chapterRegex.exec(html)) !== null) {
          const href = match[1];
          const title = decodeHtmlEntities(match[2].trim());

          if (href && title) {
            const chapterMatch = title.match(/Chương\s+(\d+)/i);
            const chapterNumber = chapterMatch ? parseInt(chapterMatch[1]) : index + 1;

            chapters.push({
              id: href.split('/').pop() || `chapter-${index}`,
              title,
              url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
              number: chapterNumber
            });
          }
          index++;
        }
      }

      // Sort chapters by number
      chapters.sort((a, b) => a.number - b.number);

      const story: Story = {
        id: storyName,
        name: storyTitle,
        chapters,
        description: storyDescriptionHtml || undefined,
        url,
        image: storyImage || undefined,
      };

      return story;
    } catch (error) {
      console.error('Error fetching story:', error);
      throw new Error('Không thể tải thông tin truyện. Vui lòng kiểm tra tên truyện.');
    }
  }

  static async getChapterContent(chapterUrl: string): Promise<string> {
    // Route to TiemTruyenChu handler if URL matches
    if (chapterUrl.includes('tiemtruyenchu.com')) {
      return this.getTiemTruyenChuChapterContent(chapterUrl);
    }

    try {
      console.log('Fetching chapter:', chapterUrl);

      const response = await axios.get(chapterUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const html = response.data;

      // Try to find content using regex patterns
      let content = '';

      // First priority: Look for <div class="truyen">
      const truyenMatch = html.match(/<div[^>]*class="[^"]*truyen[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (truyenMatch && truyenMatch[1] && truyenMatch[1].trim().length > 100) {
        content = truyenMatch[1];
        console.log('Found truyen div content, length:', content.length);
      } else {
        // Fallback: Look for common content containers in Vietnamese novel sites
        const contentPatterns = [
          // Look for div with class containing "content"
          /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
          // Look for div with id="content"
          /<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i,
          // Look for chapter-content class
          /<div[^>]*class="[^"]*chapter-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
          // Look for story-content class
          /<div[^>]*class="[^"]*story-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        ];

        for (const pattern of contentPatterns) {
          const match = html.match(pattern);
          if (match && match[1] && match[1].trim().length > 100) {
            content = match[1];
            break;
          }
        }
      }

      // If no content found, try to extract paragraphs
      if (!content) {
        const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        const paragraphs: string[] = [];
        let paraMatch;

        while ((paraMatch = paragraphRegex.exec(html)) !== null) {
          const paraContent = paraMatch[1].trim();
          if (paraContent && paraContent.length > 10) {
            paragraphs.push(paraContent);
          }
        }

        if (paragraphs.length > 0) {
          content = paragraphs.join('\n\n');
        }
      }

      // If still no content, try a broader approach
      if (!content) {
        // Look for any div that contains multiple paragraphs
        const broadPattern = /<div[^>]*>([\s\S]*?<p[^>]*>[\s\S]*?<\/p>[\s\S]*?<p[^>]*>[\s\S]*?<\/p>[\s\S]*?)<\/div>/i;
        const broadMatch = html.match(broadPattern);
        if (broadMatch && broadMatch[1]) {
          content = broadMatch[1];
        }
      }

      // Clean up and format the content
      if (content) {
        content = this.formatHtmlToText(content);
        console.log('Formatted content length:', content.length);
        console.log('First 300 chars of formatted content:');
        console.log('"' + content.substring(0, 300).replace(/\n/g, '\\n') + '"');
      }

      return content || 'Không thể tải nội dung chương này.';
    } catch (error) {
      console.error('Error fetching chapter:', error);
      throw new Error('Không thể tải nội dung chương.');
    }
  }

  /* --------------------------------------------------
     TiemTruyenChu.com support
  -------------------------------------------------- */

  /**
   * Fetch story info and chapter list from tiemtruyenchu.com
   * @param pStoryId - numeric story ID (e.g. "390")
   */
  static async getTiemTruyenChuStoryChapters(pStoryId: string): Promise<Story> {
    try {
      const url = `${TIEM_BASE_URL}/truyen/${pStoryId}`;
      console.log('Fetching TiemTruyenChu story:', url);

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const html: string = response.data;

      // --- Extract story title from <h2> -> <span class="align-middle"> ---
      let storyTitle = `Truyện #${pStoryId}`;
      const titleMatch = html.match(/<h2[^>]*class="[^"]*fw-bold[^"]*"[^>]*>[\s\S]*?<span[^>]*class="align-middle"[^>]*>([^<]*)<\/span>/i);
      if (titleMatch?.[1]) {
        storyTitle = decodeHtmlEntities(titleMatch[1].trim());
      }
      console.log('TiemTruyenChu title:', storyTitle);

      // --- Extract story image from <img class="story-poster"> ---
      let storyImage = '';
      const imageMatch = html.match(/<img[^>]*class="story-poster"[^>]*src=["']([^"']*)["'][^>]*>/i)
        || html.match(/<img[^>]*src=["']([^"']*)["'][^>]*class="story-poster"[^>]*>/i);
      if (imageMatch?.[1]) {
        storyImage = imageMatch[1].startsWith('http') ? imageMatch[1] : `${TIEM_BASE_URL}${imageMatch[1]}`;
      }
      console.log('TiemTruyenChu image:', storyImage);

      // --- Extract description from <div class="content-text"> ---
      let storyDescription = '';
      const descMatch = html.match(/<div[^>]*class="content-text"[^>]*>([\s\S]*?)<\/div>/i);
      if (descMatch?.[1]) {
        storyDescription = decodeHtmlEntities(descMatch[1].trim());
      }

      // --- Extract chapters from <a class="chapter-item-link"> with data-chap-num ---
      const chapters: Chapter[] = [];
      const chapterRegex = /<a[^>]*href=["']([^"']*)["'][^>]*class="[^"]*chapter-item-link[^"]*"[^>]*data-chap-num=["'](\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;

      let match;
      while ((match = chapterRegex.exec(html)) !== null) {
        const href = match[1];
        const chapNum = parseInt(match[2]);
        const title = decodeHtmlEntities(match[3].trim());

        const fullUrl = href.startsWith('http') ? href : `${TIEM_BASE_URL}${href}`;
        chapters.push({
          id: `chuong-${chapNum}`,
          title,
          url: fullUrl,
          number: chapNum,
        });
      }

      // Sort chapters by data-chap-num
      chapters.sort((a, b) => a.number - b.number);
      console.log(`TiemTruyenChu: parsed ${chapters.length} chapters`);

      const story: Story = {
        id: `ttc-${pStoryId}`,
        name: storyTitle,
        chapters,
        description: storyDescription || undefined,
        url,
        image: storyImage || undefined,
      };

      return story;
    } catch (error) {
      console.error('Error fetching TiemTruyenChu story:', error);
      throw new Error('Không thể tải thông tin truyện từ TiemTruyenChu. Vui lòng kiểm tra link.');
    }
  }

  /**
   * Fetch chapter content from tiemtruyenchu.com
   */
  static async getTiemTruyenChuChapterContent(pChapterUrl: string): Promise<string> {
    try {
      console.log('Fetching TiemTruyenChu chapter:', pChapterUrl);

      const response = await axios.get(pChapterUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const html: string = response.data;
      let content = '';

      // Try specific tiemtruyenchu patterns
      const contentPatterns = [
        // Look for div with id="chapter-content" or class containing "chapter-content"
        /<div[^>]*id=["']chapter-content["'][^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*chapter-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        // Look for div with class="content-text" (same pattern as description)
        /<div[^>]*class="[^"]*content-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        // Look for div with class="reading-content"
        /<div[^>]*class="[^"]*reading-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        // Look for div with id="chapter-c" or class="chapter-c"
        /<div[^>]*id=["']chapter-c["'][^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*chapter-c[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      ];

      for (const pattern of contentPatterns) {
        const match = html.match(pattern);
        if (match?.[1] && match[1].trim().length > 100) {
          content = match[1];
          console.log('Found TiemTruyenChu content with pattern, length:', content.length);
          break;
        }
      }

      // Fallback: try to find main content area between navigation and footer
      if (!content) {
        // Look for the largest div that contains actual text content (paragraphs)
        const divPattern = /<div[^>]*>([\s\S]*?)<\/div>/gi;
        let bestContent = '';
        let bestLength = 0;

        let divMatch;
        while ((divMatch = divPattern.exec(html)) !== null) {
          const divContent = divMatch[1];
          // Count text characters (excluding HTML tags)
          const textOnly = divContent.replace(/<[^>]*>/g, '').trim();
          if (textOnly.length > bestLength && textOnly.length > 200) {
            bestLength = textOnly.length;
            bestContent = divContent;
          }
        }

        if (bestContent) {
          content = bestContent;
          console.log('Found TiemTruyenChu content via largest div, length:', content.length);
        }
      }

      // Another fallback: extract paragraphs
      if (!content) {
        const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        const paragraphs: string[] = [];
        let paraMatch;

        while ((paraMatch = paragraphRegex.exec(html)) !== null) {
          const paraContent = paraMatch[1].trim();
          if (paraContent && paraContent.length > 10) {
            paragraphs.push(paraContent);
          }
        }

        if (paragraphs.length > 0) {
          content = paragraphs.join('\n\n');
          console.log('Found TiemTruyenChu content via paragraphs, count:', paragraphs.length);
        }
      }

      if (content) {
        content = this.formatHtmlToText(content);
        console.log('Formatted TiemTruyenChu content length:', content.length);
      }

      return content || 'Không thể tải nội dung chương này.';
    } catch (error) {
      console.error('Error fetching TiemTruyenChu chapter:', error);
      throw new Error('Không thể tải nội dung chương.');
    }
  }

  /**
   * Convert HTML content to formatted text while preserving line breaks and paragraphs
   */
  static formatHtmlToText(htmlContent: string): string {
    return htmlContent
      // Remove unwanted tags and their content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '') // Remove navigation
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '') // Remove headers
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '') // Remove footers
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '') // Remove sidebars
      .replace(/<div[^>]*class="[^"]*ad[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '') // Remove ads

      // Convert formatting tags to text equivalents
      .replace(/<\/p>/gi, '\n\n') // Paragraph breaks
      // Handle multiple consecutive br tags - each br becomes one newline
      .replace(/(<br\s*\/?>\s*)+/gi, (match) => {
        const brCount = (match.match(/<br\s*\/?>/gi) || []).length;
        return '\n'.repeat(brCount);
      })
      .replace(/<\/div>/gi, '\n') // Div breaks
      .replace(/<\/h[1-6]>/gi, '\n\n') // Header breaks
      .replace(/<\/li>/gi, '\n') // List item breaks

      // Remove remaining HTML tags
      .replace(/<[^>]*>/g, '')

      // Handle HTML entities
      .replace(/&nbsp;/g, ' ') // Non-breaking spaces
      .replace(/&amp;/g, '&') // Ampersands
      .replace(/&lt;/g, '<') // Less than
      .replace(/&gt;/g, '>') // Greater than
      .replace(/&quot;/g, '"') // Quotes
      .replace(/&#39;/g, "'") // Apostrophes
      .replace(/&hellip;/g, '…') // Ellipsis
      .replace(/&mdash;/g, '—') // Em dash
      .replace(/&ndash;/g, '–') // En dash

      // Clean up excessive whitespace while preserving intentional line breaks
      .replace(/[ \t]+/g, ' ') // Multiple spaces/tabs to single space
      .replace(/\n\s+/g, '\n') // Remove spaces after newlines

      .trim(); // Remove leading/trailing whitespace
  }
}
