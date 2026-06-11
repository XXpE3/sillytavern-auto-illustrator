import {describe, expect, it, vi} from 'vitest';
import {generateTextWithOptionalModelOverride} from './llm_generation_service';

describe('llm_generation_service', () => {
  it('uses generateRaw when modelId is blank', async () => {
    const context = {
      generateRaw: vi.fn().mockResolvedValue('generated text'),
    } as unknown as SillyTavernContext;

    const result = await generateTextWithOptionalModelOverride(
      context,
      'sys',
      'user',
      ''
    );

    expect(result).toBe('generated text');
    expect(context.generateRaw).toHaveBeenCalledWith({
      systemPrompt: 'sys',
      prompt: 'user',
    });
  });

  it('throws when blank modelId cannot use generateRaw', async () => {
    const context = {} as SillyTavernContext;

    await expect(
      generateTextWithOptionalModelOverride(context, 'sys', 'user', '')
    ).rejects.toThrow('LLM generation not available');
  });

  it('uses ChatCompletionService with trimmed model override', async () => {
    const payload = {messages: [], model: 'kimi-k2.6', stream: false};
    const generateRaw = vi.fn();
    const presetToGeneratePayload = vi.fn().mockResolvedValue(payload);
    const sendRequest = vi.fn().mockResolvedValue({content: 'override text'});
    const context = {
      mainApi: 'openai',
      generateRaw,
      ChatCompletionService: {
        presetToGeneratePayload,
        sendRequest,
      },
    } as unknown as SillyTavernContext;

    const result = await generateTextWithOptionalModelOverride(
      context,
      'sys',
      'user',
      '  kimi-k2.6  '
    );

    expect(result).toBe('override text');
    expect(presetToGeneratePayload).toHaveBeenCalledWith(
      {},
      {},
      {
        messages: [
          {role: 'system', content: 'sys'},
          {role: 'user', content: 'user'},
        ],
        model: 'kimi-k2.6',
        stream: false,
      }
    );
    expect(sendRequest).toHaveBeenCalledWith(payload, true);
    expect(generateRaw).not.toHaveBeenCalled();
  });

  it('throws when model override is used with a non-chat-completion API', async () => {
    const context = {
      mainApi: 'kobold',
      generateRaw: vi.fn(),
    } as unknown as SillyTavernContext;

    await expect(
      generateTextWithOptionalModelOverride(context, 'sys', 'user', 'kimi-k2.6')
    ).rejects.toThrow(
      'Prompt model override requires SillyTavern Chat Completion/OpenAI-compatible API'
    );
  });

  it('throws when ChatCompletionService is missing', async () => {
    const context = {
      mainApi: 'openai',
      generateRaw: vi.fn(),
    } as unknown as SillyTavernContext;

    await expect(
      generateTextWithOptionalModelOverride(context, 'sys', 'user', 'kimi-k2.6')
    ).rejects.toThrow('SillyTavern ChatCompletionService is not available');
  });
});
