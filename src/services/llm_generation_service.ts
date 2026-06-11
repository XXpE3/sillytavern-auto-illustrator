/**
 * LLM Generation Service
 * Wraps SillyTavern text generation with an optional per-call model override.
 */

export async function generateTextWithOptionalModelOverride(
  context: SillyTavernContext,
  systemPrompt: string,
  userPrompt: string,
  modelId?: string
): Promise<string> {
  const trimmedModelId = (modelId ?? '').trim();

  if (trimmedModelId === '') {
    if (!context.generateRaw) {
      throw new Error('LLM generation not available');
    }

    return context.generateRaw({systemPrompt, prompt: userPrompt});
  }

  if (context.mainApi !== 'openai') {
    throw new Error(
      'Prompt model override requires SillyTavern Chat Completion/OpenAI-compatible API'
    );
  }

  if (
    !context.ChatCompletionService?.presetToGeneratePayload ||
    !context.ChatCompletionService?.sendRequest
  ) {
    throw new Error('SillyTavern ChatCompletionService is not available');
  }

  const messages = [
    {role: 'system', content: systemPrompt},
    {role: 'user', content: userPrompt},
  ];
  const payload = await context.ChatCompletionService.presetToGeneratePayload(
    {},
    {},
    {messages, model: trimmedModelId, stream: false}
  );
  const result = await context.ChatCompletionService.sendRequest(payload, true);

  if (typeof result === 'function') {
    throw new Error(
      'Prompt model override returned a streaming response unexpectedly'
    );
  }

  if (!result.content) {
    throw new Error('No message generated');
  }

  return result.content;
}
