import {beforeEach, describe, expect, it, vi} from 'vitest';
import {generateUpdatedPrompt} from './prompt_updater';
import {getMetadata} from './metadata';
import {
  getPromptForImage,
  refinePrompt,
  type PromptNode,
} from './prompt_manager';
import {generateTextWithOptionalModelOverride} from './services/llm_generation_service';

vi.mock('./metadata', () => ({
  getMetadata: vi.fn(),
}));

vi.mock('./prompt_manager', () => ({
  getPromptForImage: vi.fn(),
  refinePrompt: vi.fn(),
  replacePromptTextInMessage: vi.fn(),
}));

vi.mock('./services/llm_generation_service', () => ({
  generateTextWithOptionalModelOverride: vi.fn(),
}));

describe('prompt_updater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the configured model override to the LLM helper', async () => {
    const metadata = {promptRegistry: {nodes: {}, images: {}}};
    const parent: PromptNode = {
      id: 'parent-id',
      messageId: 1,
      promptIndex: 0,
      text: 'dark forest',
      parentId: null,
      childIds: [],
      generatedImages: ['/img.png'],
      metadata: {
        createdAt: 1,
        lastUsedAt: 1,
        source: 'ai-message',
      },
    };
    const child: PromptNode = {
      id: 'child-id',
      messageId: 1,
      promptIndex: 0,
      text: 'bright forest',
      parentId: 'parent-id',
      childIds: [],
      generatedImages: [],
      metadata: {
        createdAt: 2,
        lastUsedAt: 2,
        feedback: 'make it brighter',
        source: 'ai-refined',
      },
    };
    const context = {generateRaw: vi.fn()} as unknown as SillyTavernContext;
    const settings = {
      llmPromptModelId: 'kimi-k2.6',
    } as AutoIllustratorSettings;

    vi.mocked(getMetadata).mockReturnValue(
      metadata as AutoIllustratorChatMetadata
    );
    vi.mocked(getPromptForImage).mockReturnValue(parent);
    vi.mocked(generateTextWithOptionalModelOverride).mockResolvedValue(
      '<!--img-prompt="bright forest"-->'
    );
    vi.mocked(refinePrompt).mockResolvedValue(child);

    const result = await generateUpdatedPrompt(
      '/img.png',
      'make it brighter',
      context,
      settings
    );

    expect(generateTextWithOptionalModelOverride).toHaveBeenCalledWith(
      context,
      expect.any(String),
      expect.stringContaining('make it brighter'),
      'kimi-k2.6'
    );
    expect(refinePrompt).toHaveBeenCalledWith(
      'parent-id',
      'bright forest',
      'make it brighter',
      'ai-refined',
      metadata
    );
    expect(result).toBe(child);
  });
});
