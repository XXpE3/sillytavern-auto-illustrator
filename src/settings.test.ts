import {describe, it, expect, beforeEach, vi} from 'vitest';
import {createMockContext} from './test_helpers';
import {initializeI18n} from './i18n';
import {
  getDefaultSettings,
  loadSettings,
  saveSettings,
  createSettingsUI,
  EXTENSION_NAME,
} from './settings';

describe('settings', () => {
  describe('getDefaultSettings', () => {
    it('should return default settings with correct values', () => {
      const defaults = getDefaultSettings();

      expect(defaults.enabled).toBe(true);
      expect(defaults.metaPrompt).toBeTruthy();
      expect(typeof defaults.metaPrompt).toBe('string');
      expect(defaults.currentPresetId).toBe('default');
      expect(Array.isArray(defaults.customPresets)).toBe(true);
      expect(defaults.customPresets).toEqual([]);
      expect(defaults.showGalleryWidget).toBe(true);
      expect(defaults.showProgressWidget).toBe(true);
      expect(defaults.promptGenerationMode).toBe('shared-api');
      expect(defaults.maxPromptsPerMessage).toBe(5);
      expect(defaults.llmFrequencyGuidelines).toBeTruthy();
      expect(defaults.llmPromptWritingGuidelines).toBeTruthy();
      expect(defaults.llmPromptModelId).toBe('');
    });
  });

  describe('loadSettings', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should load existing settings from context', () => {
      const existingSettings: AutoIllustratorSettings = {
        enabled: false,
        metaPrompt: 'custom prompt',
        currentPresetId: 'custom-123',
        customPresets: [],
        streamingEnabled: false,
        streamingPollInterval: 500,
        maxConcurrentGenerations: 2,
        minGenerationInterval: 100,
        monitorPollingInterval: 100,
        logLevel: 'debug',
        manualGenerationMode: 'append',
        promptDetectionPatterns: [],
        commonStyleTags: 'test, tags',
        commonStyleTagsPosition: 'suffix',
        showGalleryWidget: false,
        showProgressWidget: false,
        enableClickToRegenerate: true,
        promptGenerationMode: 'regex',
        maxPromptsPerMessage: 5,
        contextMessageCount: 10,
        llmFrequencyGuidelines: 'test frequency',
        llmPromptWritingGuidelines: 'test writing',
        llmPromptModelId: 'kimi-k2.6',
      };

      const mockContext = createMockContext({
        extensionSettings: {
          [EXTENSION_NAME]: existingSettings,
        },
      });

      const loaded = loadSettings(mockContext);

      expect(loaded.enabled).toEqual(existingSettings.enabled);
      expect(loaded.currentPresetId).toEqual(existingSettings.currentPresetId);
      expect(loaded.customPresets).toEqual(existingSettings.customPresets);
      expect(loaded.showGalleryWidget).toEqual(
        existingSettings.showGalleryWidget
      );
      expect(loaded.showProgressWidget).toEqual(
        existingSettings.showProgressWidget
      );
      expect(loaded.llmPromptModelId).toEqual(
        existingSettings.llmPromptModelId
      );
    });

    it('should return defaults if no settings exist', () => {
      const mockContext = createMockContext({
        extensionSettings: {},
      });

      const loaded = loadSettings(mockContext);

      expect(loaded.enabled).toBe(true);
      expect(loaded.metaPrompt).toBeTruthy();
    });

    it('should merge partial settings with defaults', () => {
      const partialSettings = {
        enabled: false,
      };

      const mockContext = createMockContext({
        extensionSettings: {
          [EXTENSION_NAME]: partialSettings,
        },
      });

      const loaded = loadSettings(mockContext);

      expect(loaded.enabled).toBe(false);
      expect(loaded.metaPrompt).toBeTruthy(); // Should use default
      expect(loaded.llmPromptModelId).toBe('');
    });
  });

  describe('saveSettings', () => {
    it('should save settings to context and call saveSettingsDebounced', () => {
      const mockSaveDebounced = vi.fn();
      const mockContext = createMockContext({
        extensionSettings: {},
        saveSettingsDebounced: mockSaveDebounced,
      });

      const settings: AutoIllustratorSettings = {
        enabled: true,
        metaPrompt: 'test prompt',
        currentPresetId: 'default',
        customPresets: [],
        streamingEnabled: true,
        streamingPollInterval: 300,
        maxConcurrentGenerations: 1,
        minGenerationInterval: 0,
        monitorPollingInterval: 100,
        logLevel: 'info',
        manualGenerationMode: 'replace',
        promptDetectionPatterns: [],
        commonStyleTags: '',
        commonStyleTagsPosition: 'prefix',
        showGalleryWidget: true,
        showProgressWidget: true,
        enableClickToRegenerate: true,
        promptGenerationMode: 'regex',
        maxPromptsPerMessage: 5,
        contextMessageCount: 10,
        llmFrequencyGuidelines: '',
        llmPromptWritingGuidelines: '',
        llmPromptModelId: 'gpt-5.4-mini',
      };

      saveSettings(settings, mockContext);

      expect(mockContext.extensionSettings[EXTENSION_NAME]).toEqual(settings);
      expect(mockSaveDebounced).toHaveBeenCalled();
    });

    it('should update existing settings', () => {
      const mockSaveDebounced = vi.fn();
      const mockContext = createMockContext({
        extensionSettings: {
          [EXTENSION_NAME]: {
            enabled: true,
            metaPrompt: 'old',
          },
        },
        saveSettingsDebounced: mockSaveDebounced,
      });

      const newSettings: AutoIllustratorSettings = {
        enabled: false,
        metaPrompt: 'new',
        currentPresetId: 'custom-456',
        customPresets: [],
        streamingEnabled: false,
        streamingPollInterval: 500,
        maxConcurrentGenerations: 2,
        minGenerationInterval: 100,
        monitorPollingInterval: 100,
        logLevel: 'warn',
        manualGenerationMode: 'append',
        promptDetectionPatterns: [],
        commonStyleTags: '',
        commonStyleTagsPosition: 'prefix',
        showGalleryWidget: false,
        showProgressWidget: false,
        enableClickToRegenerate: true,
        promptGenerationMode: 'llm-post',
        maxPromptsPerMessage: 3,
        contextMessageCount: 15,
        llmFrequencyGuidelines: 'new frequency',
        llmPromptWritingGuidelines: 'new writing',
        llmPromptModelId: '',
      };

      saveSettings(newSettings, mockContext);

      expect(mockContext.extensionSettings[EXTENSION_NAME]).toEqual(
        newSettings
      );
      expect(mockSaveDebounced).toHaveBeenCalled();
    });

    it('should handle widget visibility settings correctly', () => {
      const mockSaveDebounced = vi.fn();
      const mockContext = createMockContext({
        extensionSettings: {},
        saveSettingsDebounced: mockSaveDebounced,
      });

      const settingsGalleryOnly: Partial<AutoIllustratorSettings> = {
        showGalleryWidget: true,
        showProgressWidget: false,
      };

      const settingsProgressOnly: Partial<AutoIllustratorSettings> = {
        showGalleryWidget: false,
        showProgressWidget: true,
      };

      const settingsNone: Partial<AutoIllustratorSettings> = {
        showGalleryWidget: false,
        showProgressWidget: false,
      };

      // Test each combination
      const defaults = getDefaultSettings();

      saveSettings({...defaults, ...settingsGalleryOnly}, mockContext);
      expect(
        mockContext.extensionSettings[EXTENSION_NAME].showGalleryWidget
      ).toBe(true);
      expect(
        mockContext.extensionSettings[EXTENSION_NAME].showProgressWidget
      ).toBe(false);

      saveSettings({...defaults, ...settingsProgressOnly}, mockContext);
      expect(
        mockContext.extensionSettings[EXTENSION_NAME].showGalleryWidget
      ).toBe(false);
      expect(
        mockContext.extensionSettings[EXTENSION_NAME].showProgressWidget
      ).toBe(true);

      saveSettings({...defaults, ...settingsNone}, mockContext);
      expect(
        mockContext.extensionSettings[EXTENSION_NAME].showGalleryWidget
      ).toBe(false);
      expect(
        mockContext.extensionSettings[EXTENSION_NAME].showProgressWidget
      ).toBe(false);
    });

    it('should handle prompt generation mode correctly', () => {
      const mockSaveDebounced = vi.fn();
      const mockContext = createMockContext({
        extensionSettings: {},
        saveSettingsDebounced: mockSaveDebounced,
      });

      const defaults = getDefaultSettings();

      // Test regex mode (default)
      const regexSettings = {
        ...defaults,
        promptGenerationMode: 'regex' as const,
      };
      saveSettings(regexSettings, mockContext);
      expect(
        mockContext.extensionSettings[EXTENSION_NAME].promptGenerationMode
      ).toBe('regex');

      // Test LLM mode
      const llmSettings = {
        ...defaults,
        promptGenerationMode: 'llm-post' as const,
      };
      saveSettings(llmSettings, mockContext);
      expect(
        mockContext.extensionSettings[EXTENSION_NAME].promptGenerationMode
      ).toBe('llm-post');
    });

    it('should save LLM prompt model ID correctly', () => {
      const mockSaveDebounced = vi.fn();
      const mockContext = createMockContext({
        extensionSettings: {},
        saveSettingsDebounced: mockSaveDebounced,
      });

      const settings = {
        ...getDefaultSettings(),
        llmPromptModelId: 'kimi-k2.6',
      };

      saveSettings(settings, mockContext);

      expect(
        mockContext.extensionSettings[EXTENSION_NAME].llmPromptModelId
      ).toBe('kimi-k2.6');
    });

    it('should save LLM guidelines correctly', () => {
      const mockSaveDebounced = vi.fn();
      const mockContext = createMockContext({
        extensionSettings: {},
        saveSettingsDebounced: mockSaveDebounced,
      });

      const defaults = getDefaultSettings();
      const customGuidelines = {
        ...defaults,
        llmFrequencyGuidelines: 'Custom frequency guidelines',
        llmPromptWritingGuidelines: 'Custom writing guidelines',
      };

      saveSettings(customGuidelines, mockContext);

      expect(
        mockContext.extensionSettings[EXTENSION_NAME].llmFrequencyGuidelines
      ).toBe('Custom frequency guidelines');
      expect(
        mockContext.extensionSettings[EXTENSION_NAME].llmPromptWritingGuidelines
      ).toBe('Custom writing guidelines');
    });
  });

  describe('createSettingsUI', () => {
    it('renders LLM prompt model ID input and label text', () => {
      initializeI18n(
        createMockContext({
          translate: (key: string) =>
            ({
              'settings.llmPromptModelId': 'LLM Model ID for Auto Illustrator',
              'settings.llmPromptModelIdDesc':
                "Optional. Applies to Auto Illustrator's separate LLM calls: Independent API prompt generation and Update Prompt. Leave blank to use SillyTavern's current model. Requires a Chat Completion/OpenAI-compatible connection when set.",
            })[key] ?? key,
        })
      );

      const html = createSettingsUI();

      expect(html).toContain('auto_illustrator_llm_prompt_model_id');
      expect(html).toContain('LLM Model ID for Auto Illustrator');
      expect(html).toContain(
        "Applies to Auto Illustrator's separate LLM calls"
      );
    });
  });
});
