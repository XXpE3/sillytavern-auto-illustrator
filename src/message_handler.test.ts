/**
 * Tests for Message Handler V2 Module
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  afterEach,
  type Mock,
} from 'vitest';
import {
  handleStreamTokenStarted,
  handleMessageReceived,
  handleGenerationEnded,
  handleChatChanged,
  cancelAllDelayedReconciliations,
  runIndependentApiGenerationForMessage,
  isIndependentApiGenerationPending,
} from './message_handler';
import {generatePromptsForMessage} from './services/prompt_generation_service';
import {insertPromptTagsWithContext} from './prompt_insertion';
import {saveMetadata} from './metadata';

type MockSessionManager = {
  startStreamingSession: Mock;
  setupStreamingCompletion: Mock;
  finalizeStreamingAndInsert: Mock;
  getSession: Mock;
  cancelSession: Mock;
  getAllSessions: Mock;
};

// Mock dependencies
vi.mock('./logger', () => ({
  createLogger: () => ({
    trace: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('./session_manager', () => ({
  sessionManager: {
    startStreamingSession: vi.fn(),
    setupStreamingCompletion: vi.fn(),
    finalizeStreamingAndInsert: vi.fn(),
    getSession: vi.fn(),
    cancelSession: vi.fn(),
    getAllSessions: vi.fn(() => []),
  },
}));

vi.mock('./services/prompt_generation_service', () => ({
  generatePromptsForMessage: vi.fn(),
}));

vi.mock('./prompt_insertion', () => ({
  insertPromptTagsWithContext: vi.fn(),
}));

vi.mock('./utils/message_renderer', () => ({
  renderMessageUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./metadata', () => ({
  getMetadata: vi.fn(() => ({})),
  saveMetadata: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./reconciliation', () => ({
  reconcileMessage: vi.fn(() => ({
    updatedText: 'message text',
    result: {restoredCount: 0, missingCount: 0, errors: []},
  })),
}));

const mockSillyTavern = {
  getContext: vi.fn(),
} as unknown as typeof SillyTavern; // Partial test double for the global API.
global.SillyTavern = mockSillyTavern;

describe('Message Handler V2', () => {
  let mockContext: SillyTavernContext;
  let mockSettings: AutoIllustratorSettings;
  let mockSessionManager: MockSessionManager;

  beforeEach(async () => {
    // Get the mocked sessionManager
    const {sessionManager} = await import('./session_manager');
    mockSessionManager = sessionManager as unknown as MockSessionManager;
    mockContext = {
      chat: [
        {mes: 'Message 0', is_user: true},
        {mes: 'Message 1', is_user: false, name: 'Assistant'},
        {mes: 'Message 2', is_user: false, name: 'Assistant'},
      ],
    } as unknown as SillyTavernContext; // Tests only need chat.

    mockSettings = {
      streamingEnabled: true,
      promptDetectionPatterns: ['<!--img-prompt="{PROMPT}"-->'],
      promptGenerationMode: 'regex', // Default to regex mode
      maxPromptsPerMessage: 5,
    } as unknown as AutoIllustratorSettings; // Tests only need these settings.

    global.toastr = {
      success: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    } satisfies Toastr;

    // Clear all mocks and set defaults
    vi.clearAllMocks();
    mockSessionManager.startStreamingSession.mockResolvedValue({
      sessionId: 'session1',
      messageId: 1,
      type: 'streaming',
    });
    mockSessionManager.setupStreamingCompletion.mockReturnValue(undefined);
    mockSessionManager.finalizeStreamingAndInsert.mockResolvedValue(0);
    mockSessionManager.getSession.mockReturnValue(null);
    vi.mocked(generatePromptsForMessage).mockResolvedValue([]);
    vi.mocked(insertPromptTagsWithContext).mockReturnValue({
      updatedText: 'Message 1',
      insertedCount: 0,
      failedSuggestions: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleStreamTokenStarted', () => {
    it('should start a streaming session', async () => {
      mockSessionManager.startStreamingSession.mockResolvedValue({
        sessionId: 'session1',
        messageId: 1,
        type: 'streaming',
      });

      await handleStreamTokenStarted(1, mockContext, mockSettings);

      expect(mockSessionManager.startStreamingSession).toHaveBeenCalledWith(
        1,
        mockContext,
        mockSettings
      );
    });

    it('should handle errors during session start', async () => {
      mockSessionManager.startStreamingSession.mockRejectedValue(
        new Error('Test error')
      );

      // Should not throw, just log error
      await expect(
        handleStreamTokenStarted(1, mockContext, mockSettings)
      ).resolves.not.toThrow();

      expect(mockSessionManager.startStreamingSession).toHaveBeenCalled();
    });
  });

  describe('runIndependentApiGenerationForMessage', () => {
    beforeEach(() => {
      mockSettings.promptGenerationMode = 'independent-api';
    });

    it('should insert prompts and start generation for manual happy path', async () => {
      vi.mocked(generatePromptsForMessage).mockResolvedValue([
        {
          text: 'forest, moonlight',
          insertAfter: 'Message',
          insertBefore: '1',
          reasoning: 'visual scene',
        },
      ]);
      vi.mocked(insertPromptTagsWithContext).mockReturnValue({
        updatedText: 'Message <!--img-prompt="forest, moonlight"--> 1',
        insertedCount: 1,
        failedSuggestions: [],
      });

      const result = await runIndependentApiGenerationForMessage(
        1,
        mockContext,
        mockSettings,
        'manual'
      );

      expect(generatePromptsForMessage).toHaveBeenCalledWith(
        'Message 1',
        mockContext,
        mockSettings,
        {targetMessageId: 1}
      );
      expect(mockContext.chat[1].mes).toBe(
        'Message <!--img-prompt="forest, moonlight"--> 1'
      );
      expect(saveMetadata).toHaveBeenCalled();
      expect(mockSessionManager.startStreamingSession).toHaveBeenCalledWith(
        1,
        mockContext,
        mockSettings
      );
      expect(mockSessionManager.setupStreamingCompletion).toHaveBeenCalledWith(
        1,
        mockContext,
        mockSettings
      );
      expect(result).toEqual({
        status: 'started',
        reason: 'started',
        promptCount: 1,
        insertedCount: 1,
        appendedCount: 0,
      });
    });

    it('should surface rejected prompt generation without starting a session', async () => {
      vi.mocked(generatePromptsForMessage).mockRejectedValue(
        new Error('LLM error')
      );

      const result = await runIndependentApiGenerationForMessage(
        1,
        mockContext,
        mockSettings,
        'manual'
      );

      expect(result).toMatchObject({
        status: 'failed',
        reason: 'prompt-generation-failed',
      });
      expect(toastr.warning).toHaveBeenCalledWith(
        'toast.llmPromptGenerationFailed',
        'extensionName'
      );
      expect(mockSessionManager.startStreamingSession).not.toHaveBeenCalled();
    });

    it('should warn and skip when manual prompt generation returns no prompts', async () => {
      vi.mocked(generatePromptsForMessage).mockResolvedValue([]);

      const result = await runIndependentApiGenerationForMessage(
        1,
        mockContext,
        mockSettings,
        'manual'
      );

      expect(result).toMatchObject({
        status: 'skipped',
        reason: 'no-prompts',
      });
      expect(toastr.warning).toHaveBeenCalledWith(
        'toast.noPromptsGenerated',
        'extensionName'
      );
      expect(mockSessionManager.startStreamingSession).not.toHaveBeenCalled();
    });

    it('should skip active sessions without calling prompt generation', async () => {
      mockSessionManager.getSession.mockReturnValue({
        sessionId: 'session1',
        messageId: 1,
        type: 'streaming',
      });

      const result = await runIndependentApiGenerationForMessage(
        1,
        mockContext,
        mockSettings,
        'manual'
      );

      expect(result).toMatchObject({
        status: 'skipped',
        reason: 'active-session',
      });
      expect(toastr.warning).toHaveBeenCalledWith(
        'toast.cannotManualWhileStreaming',
        'extensionName'
      );
      expect(generatePromptsForMessage).not.toHaveBeenCalled();
      expect(mockSessionManager.startStreamingSession).not.toHaveBeenCalled();
    });

    it('should skip duplicate prompt generation while one is already pending', async () => {
      let resolvePrompts: (
        value: Awaited<ReturnType<typeof generatePromptsForMessage>>
      ) => void = () => {};
      const pendingPrompts = new Promise<
        Awaited<ReturnType<typeof generatePromptsForMessage>>
      >(resolve => {
        resolvePrompts = resolve;
      });
      vi.mocked(generatePromptsForMessage).mockReturnValueOnce(pendingPrompts);
      vi.mocked(insertPromptTagsWithContext).mockReturnValue({
        updatedText: 'Message <!--img-prompt="forest"--> 1',
        insertedCount: 1,
        failedSuggestions: [],
      });

      const firstRun = runIndependentApiGenerationForMessage(
        1,
        mockContext,
        mockSettings,
        'automatic'
      );
      await Promise.resolve();

      const secondRun = await runIndependentApiGenerationForMessage(
        1,
        mockContext,
        mockSettings,
        'manual'
      );

      expect(secondRun).toMatchObject({
        status: 'skipped',
        reason: 'prompt-generation-in-progress',
      });
      expect(toastr.warning).toHaveBeenCalledWith(
        'toast.manualIndependentAlreadyRunning',
        'extensionName'
      );
      expect(generatePromptsForMessage).toHaveBeenCalledTimes(1);
      expect(isIndependentApiGenerationPending(1)).toBe(true);

      resolvePrompts([
        {
          text: 'forest',
          insertAfter: 'Message',
          insertBefore: '1',
          reasoning: 'visual scene',
        },
      ]);
      await firstRun;

      expect(isIndependentApiGenerationPending(1)).toBe(false);
    });
  });

  describe('handleMessageReceived', () => {
    it('should finalize streaming session when active', async () => {
      mockSessionManager.getSession.mockReturnValue({
        sessionId: 'session1',
        messageId: 1,
        type: 'streaming',
      });
      mockSessionManager.finalizeStreamingAndInsert.mockResolvedValue(3);

      await handleMessageReceived(1, mockContext, mockSettings);

      expect(mockSessionManager.getSession).toHaveBeenCalledWith(1);
      expect(
        mockSessionManager.finalizeStreamingAndInsert
      ).toHaveBeenCalledWith(1, mockContext);
    });

    it('should skip if message not found', async () => {
      await handleMessageReceived(999, mockContext, mockSettings);

      expect(mockSessionManager.getSession).not.toHaveBeenCalled();
      expect(
        mockSessionManager.finalizeStreamingAndInsert
      ).not.toHaveBeenCalled();
    });

    it('should skip if message is from user', async () => {
      await handleMessageReceived(0, mockContext, mockSettings);

      expect(mockSessionManager.getSession).not.toHaveBeenCalled();
      expect(
        mockSessionManager.finalizeStreamingAndInsert
      ).not.toHaveBeenCalled();
    });

    it('should skip if no active session exists', async () => {
      mockSessionManager.getSession.mockReturnValue(null);

      await handleMessageReceived(1, mockContext, mockSettings);

      expect(mockSessionManager.getSession).toHaveBeenCalledWith(1);
      expect(
        mockSessionManager.finalizeStreamingAndInsert
      ).not.toHaveBeenCalled();
    });

    it('should skip if session type is not streaming', async () => {
      mockSessionManager.getSession.mockReturnValue({
        sessionId: 'session1',
        messageId: 1,
        type: 'regeneration', // Not streaming
      });

      await handleMessageReceived(1, mockContext, mockSettings);

      expect(mockSessionManager.getSession).toHaveBeenCalledWith(1);
      expect(
        mockSessionManager.finalizeStreamingAndInsert
      ).not.toHaveBeenCalled();
    });

    it('should handle errors during finalization', async () => {
      mockSessionManager.getSession.mockReturnValue({
        sessionId: 'session1',
        messageId: 1,
        type: 'streaming',
      });
      mockSessionManager.finalizeStreamingAndInsert.mockRejectedValue(
        new Error('Test error')
      );

      // Should not throw, just log error
      await expect(
        handleMessageReceived(1, mockContext, mockSettings)
      ).resolves.not.toThrow();

      expect(mockSessionManager.finalizeStreamingAndInsert).toHaveBeenCalled();
    });

    it('should handle system messages', async () => {
      mockContext.chat[1].is_system = true;

      mockSessionManager.getSession.mockReturnValue({
        sessionId: 'session1',
        messageId: 1,
        type: 'streaming',
      });
      mockSessionManager.finalizeStreamingAndInsert.mockResolvedValue(2);

      await handleMessageReceived(1, mockContext, mockSettings);

      // Should process even for system messages (only skip user messages)
      expect(mockSessionManager.finalizeStreamingAndInsert).toHaveBeenCalled();
    });
  });

  describe('handleGenerationEnded - Delayed Reconciliation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      global.SillyTavern.getContext = vi.fn().mockReturnValue(mockContext);
      mockSettings.finalReconciliationDelayMs = 5000;
    });

    afterEach(() => {
      vi.useRealTimers();
      cancelAllDelayedReconciliations(); // Clean up any pending timeouts
    });

    it('should run immediate reconciliation on GENERATION_ENDED', async () => {
      const {reconcileMessage} = await import('./reconciliation');

      await handleGenerationEnded(1, mockContext, mockSettings);

      // Should have called reconciliation once (immediate)
      expect(reconcileMessage).toHaveBeenCalledTimes(1);
      expect(reconcileMessage).toHaveBeenCalledWith(
        1,
        'Message 1',
        expect.anything()
      );
    });

    it('should schedule delayed reconciliation after GENERATION_ENDED', async () => {
      const {reconcileMessage} = await import('./reconciliation');
      vi.mocked(reconcileMessage).mockClear();

      await handleGenerationEnded(1, mockContext, mockSettings);

      // Should have immediate reconciliation
      expect(reconcileMessage).toHaveBeenCalledTimes(1);

      // Fast-forward 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      // Should have delayed reconciliation
      expect(reconcileMessage).toHaveBeenCalledTimes(2); // immediate + delayed
    });

    it('should not schedule delayed reconciliation if delay is 0', async () => {
      const {reconcileMessage} = await import('./reconciliation');
      vi.mocked(reconcileMessage).mockClear();

      mockSettings.finalReconciliationDelayMs = 0;
      await handleGenerationEnded(1, mockContext, mockSettings);

      // Only immediate reconciliation
      expect(reconcileMessage).toHaveBeenCalledTimes(1);

      // Fast-forward past any potential delay
      await vi.advanceTimersByTimeAsync(10000);

      // Still only immediate
      expect(reconcileMessage).toHaveBeenCalledTimes(1);
    });

    it('should cancel delayed reconciliation on chat change', async () => {
      const {reconcileMessage} = await import('./reconciliation');
      vi.mocked(reconcileMessage).mockClear();

      await handleGenerationEnded(1, mockContext, mockSettings);

      // Chat changes before delay expires
      handleChatChanged();

      // Fast-forward past the delay
      await vi.advanceTimersByTimeAsync(10000);

      // Should only have immediate reconciliation, delayed was cancelled
      expect(reconcileMessage).toHaveBeenCalledTimes(1);
    });

    it('should cancel existing delayed reconciliation when scheduling new one for same message', async () => {
      const {reconcileMessage} = await import('./reconciliation');
      vi.mocked(reconcileMessage).mockClear();

      // Schedule first
      await handleGenerationEnded(1, mockContext, mockSettings);

      // Schedule second for same message
      await handleGenerationEnded(1, mockContext, mockSettings);

      // Should have 2 immediate reconciliations
      expect(reconcileMessage).toHaveBeenCalledTimes(2);

      // Fast-forward
      await vi.advanceTimersByTimeAsync(5000);

      // Should have 2 immediate + 1 delayed (second one replaced first)
      expect(reconcileMessage).toHaveBeenCalledTimes(3);
    });

    it('should skip reconciliation for user messages', async () => {
      const {reconcileMessage} = await import('./reconciliation');
      vi.mocked(reconcileMessage).mockClear();

      await handleGenerationEnded(0, mockContext, mockSettings); // message 0 is user

      // Should not run reconciliation
      expect(reconcileMessage).not.toHaveBeenCalled();

      // Should not schedule delayed reconciliation either
      await vi.advanceTimersByTimeAsync(10000);
      expect(reconcileMessage).not.toHaveBeenCalled();
    });

    it('should handle missing message gracefully', async () => {
      const {reconcileMessage} = await import('./reconciliation');
      vi.mocked(reconcileMessage).mockClear();

      await handleGenerationEnded(999, mockContext, mockSettings); // non-existent message

      // Should not run reconciliation
      expect(reconcileMessage).not.toHaveBeenCalled();

      // Should not schedule delayed reconciliation either
      await vi.advanceTimersByTimeAsync(10000);
      expect(reconcileMessage).not.toHaveBeenCalled();
    });

    it('should adjust messageId when it equals chat.length (SillyTavern bug)', async () => {
      const {reconcileMessage} = await import('./reconciliation');
      vi.mocked(reconcileMessage).mockClear();

      // GENERATION_ENDED sometimes emits chat.length instead of chat.length - 1
      // Our chat has 3 messages (indices 0, 1, 2), so chat.length = 3
      await handleGenerationEnded(3, mockContext, mockSettings);

      // Should have adjusted to messageId 2 and run reconciliation
      expect(reconcileMessage).toHaveBeenCalledTimes(1);
      expect(reconcileMessage).toHaveBeenCalledWith(
        2, // Adjusted from 3 to 2
        'Message 2',
        expect.anything()
      );

      // Should also schedule delayed reconciliation with adjusted messageId
      await vi.advanceTimersByTimeAsync(5000);
      expect(reconcileMessage).toHaveBeenCalledTimes(2);
      expect(reconcileMessage).toHaveBeenLastCalledWith(
        2,
        'Message 2',
        expect.anything()
      );
    });
  });
});
