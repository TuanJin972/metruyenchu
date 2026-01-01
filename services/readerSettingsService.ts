import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Font from 'expo-font';
import { Literata_400Regular as gLiterata400Regular } from '@expo-google-fonts/literata';
import { Lora_400Regular as gLora400Regular } from '@expo-google-fonts/lora';
import { Merriweather_400Regular as gMerriweather400Regular } from '@expo-google-fonts/merriweather';
import { Roboto_400Regular as gRoboto400Regular } from '@expo-google-fonts/roboto';
import { Spectral_400Regular as gSpectral400Regular } from '@expo-google-fonts/spectral';

/**
 * Reader Settings Service
 * Manages reader-specific settings like font selection
 */
export class ReaderSettingsService {
  private static readonly FONT_KEY = '@reader_font';

  /**
   * Font IDs used for storage and selection.
   * Keeping this stable avoids breaking stored settings.
   */
  public static readonly AVAILABLE_FONT_IDS = [
    'System',
    'Merriweather',
    'Literata',
    'Lora',
    'Roboto',
    'Spectral',
  ] as const;

  public static readonly DEFAULT_FONT_ID: ReaderFontId = 'Literata';

  public static readonly AVAILABLE_FONTS: ReaderFontOption[] = [
    { id: 'System', label: 'System', fontFamily: undefined, isCustom: false },
    { id: 'Merriweather', label: 'Merriweather', fontFamily: 'Merriweather_400Regular', isCustom: true },
    { id: 'Literata', label: 'Literata', fontFamily: 'Literata_400Regular', isCustom: true },
    { id: 'Lora', label: 'Lora', fontFamily: 'Lora_400Regular', isCustom: true },
    { id: 'Roboto', label: 'Roboto', fontFamily: 'Roboto_400Regular', isCustom: true },
    { id: 'Spectral', label: 'Spectral', fontFamily: 'Spectral_400Regular', isCustom: true },
  ];

  private static gFontsLoaded = false;
  private static gLoadFontsPromise: Promise<void> | null = null;

  /**
   * Load bundled fonts required by reader.
   * This should be called before using custom fontFamily values.
   */
  public static async ensureFontsLoaded(): Promise<void> {
    if (this.gFontsLoaded) return;
    if (this.gLoadFontsPromise) {
      return this.gLoadFontsPromise;
    }

    this.gLoadFontsPromise = (async () => {
      try {
        await Font.loadAsync({
          Merriweather_400Regular: gMerriweather400Regular,
          Literata_400Regular: gLiterata400Regular,
          Lora_400Regular: gLora400Regular,
          Roboto_400Regular: gRoboto400Regular,
          Spectral_400Regular: gSpectral400Regular,
        });
      } catch (error) {
        // Do not throw - reader will fallback to system fonts if custom fonts fail to load.
        console.warn('Failed to load reader fonts:', error);
      } finally {
        // Mark as attempted to avoid repeated loads during the same session.
        this.gFontsLoaded = true;
        this.gLoadFontsPromise = null;
      }
    })();

    return this.gLoadFontsPromise;
  }

  /**
   * Get the font option for a given font ID.
   */
  public static getFontOption(pFontId: ReaderFontId): ReaderFontOption {
    return (
      this.AVAILABLE_FONTS.find(f => f.id === pFontId) ??
      this.AVAILABLE_FONTS.find(f => f.id === this.DEFAULT_FONT_ID) ??
      this.AVAILABLE_FONTS[0]
    );
  }

  /**
   * Get the RN fontFamily for a given font ID.
   */
  public static getFontFamily(pFontId: ReaderFontId): string | undefined {
    return this.getFontOption(pFontId).fontFamily;
  }

  /**
   * Get the selected font ID for reader.
   * Also supports legacy stored values (old labels like "Avenir Next").
   */
  public static async getFontId(): Promise<ReaderFontId> {
    try {
      const gStored = await AsyncStorage.getItem(this.FONT_KEY);
      if (!gStored) return this.DEFAULT_FONT_ID;

      const gTrimmed = gStored.trim();

      // New format: stored by ID
      if (this.AVAILABLE_FONT_IDS.includes(gTrimmed as ReaderFontId)) {
        return gTrimmed as ReaderFontId;
      }

      // Legacy format: stored by label
      const gLegacyMap: Record<string, ReaderFontId> = {
        Merriweather: 'Merriweather',
        Literata: 'Literata',
        Lora: 'Lora',
        Roboto: 'Roboto',
        Spectral: 'Spectral',
        System: 'System',

        // Migrate older reader font values to Google Fonts equivalents
        AvenirNext: 'Roboto',
        'Avenir Next': 'Roboto',
        Arial: 'Roboto',
        Helvetica: 'Roboto',
        Verdana: 'Roboto',
        Noto: 'Roboto',
        Palatino: 'Lora',
        Bookerly: 'Literata',
      };

      return gLegacyMap[gTrimmed] ?? this.DEFAULT_FONT_ID;
    } catch (error) {
      console.error('Error getting reader font:', error);
      return this.DEFAULT_FONT_ID;
    }
  }

  /**
   * Set the selected font ID for reader.
   */
  public static async setFontId(pFontId: ReaderFontId): Promise<void> {
    try {
      if (!this.AVAILABLE_FONT_IDS.includes(pFontId)) {
        throw new Error(`Font "${pFontId}" is not supported`);
      }
      await AsyncStorage.setItem(this.FONT_KEY, pFontId);
    } catch (error) {
      console.error('Error setting reader font:', error);
      throw error;
    }
  }

  /**
   * Reset font to default
   */
  public static async resetFont(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.FONT_KEY);
    } catch (error) {
      console.error('Error resetting reader font:', error);
    }
  }
}

export type ReaderFontId = (typeof ReaderSettingsService.AVAILABLE_FONT_IDS)[number];

export interface ReaderFontOption {
  id: ReaderFontId;
  label: string;
  /** React Native fontFamily name. For custom fonts, this must match the key used in Font.loadAsync. */
  fontFamily?: string;
  isCustom?: boolean;
}
