import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest';
import {
  addIndependentApiManualTriggerButtons,
  attachIndependentApiManualTriggerButton,
  INDEPENDENT_MANUAL_TRIGGER_CLASS,
} from './manual_independent_trigger';
import {
  isIndependentApiGenerationPending,
  runIndependentApiGenerationForMessage,
} from './message_handler';
import {sessionManager} from './session_manager';

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
    isActive: vi.fn(),
  },
}));

vi.mock('./message_handler', () => ({
  isIndependentApiGenerationPending: vi.fn(),
  runIndependentApiGenerationForMessage: vi.fn(),
}));

type MockSessionManager = {
  isActive: Mock;
};

const mockSillyTavern = {
  getContext: vi.fn(),
} as unknown as typeof SillyTavern; // Partial test double for the global API.
global.SillyTavern = mockSillyTavern;

function createSettings(
  promptGenerationMode: AutoIllustratorSettings['promptGenerationMode'] = 'independent-api'
): AutoIllustratorSettings {
  return {
    enabled: true,
    promptGenerationMode,
    promptDetectionPatterns: ['<!--img-prompt="([^"]+)"-->'],
  } as unknown as AutoIllustratorSettings; // Tests only need these settings.
}

function createContext(messageText = 'Assistant message'): SillyTavernContext {
  return {
    chat: [
      {
        mes: messageText,
        is_user: false,
        name: 'Assistant',
      },
    ],
  } as unknown as SillyTavernContext; // Tests only need chat.
}

function appendMessageElement(withManualButton = false): HTMLElement {
  const messageEl = document.createElement('div');
  messageEl.className = 'mes';
  messageEl.setAttribute('mesid', '0');

  const buttonsEl = document.createElement('div');
  buttonsEl.className = 'mes_buttons';
  messageEl.append(buttonsEl);

  if (withManualButton) {
    const manualButton = document.createElement('button');
    manualButton.className = 'auto_illustrator_manual_gen';
    buttonsEl.append(manualButton);
  }

  document.body.append(messageEl);
  return messageEl;
}

describe('manual_independent_trigger', () => {
  let mockSessionManager: MockSessionManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    mockSessionManager = sessionManager as unknown as MockSessionManager;
    vi.clearAllMocks();
    mockSessionManager.isActive.mockReturnValue(false);
    vi.mocked(isIndependentApiGenerationPending).mockReturnValue(false);
    vi.mocked(runIndependentApiGenerationForMessage).mockResolvedValue({
      status: 'skipped',
      reason: 'no-prompts',
      promptCount: 0,
      insertedCount: 0,
      appendedCount: 0,
    });
    global.toastr = {
      success: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    } satisfies Toastr;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('renders one trigger for an assistant message without prompt tags in Independent API mode', () => {
    const context = createContext();
    mockSillyTavern.getContext = vi.fn().mockReturnValue(context);
    appendMessageElement();

    addIndependentApiManualTriggerButtons(createSettings());

    expect(
      document.querySelectorAll(`.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`)
    ).toHaveLength(1);
  });

  it('inserts the trigger immediately after the existing purple manual button', () => {
    const context = createContext();
    const messageEl = appendMessageElement(true);

    attachIndependentApiManualTriggerButton(0, context, createSettings());

    const existingPurpleButton = messageEl.querySelector(
      '.auto_illustrator_manual_gen'
    );
    const triggerButton = messageEl.querySelector(
      `.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`
    );
    expect(existingPurpleButton?.nextElementSibling).toBe(triggerButton);
  });

  it('removes the trigger in Shared API mode', () => {
    const context = createContext();
    mockSillyTavern.getContext = vi.fn().mockReturnValue(context);
    appendMessageElement();

    addIndependentApiManualTriggerButtons(createSettings());
    addIndependentApiManualTriggerButtons(createSettings('shared-api'));

    expect(
      document.querySelector(`.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`)
    ).toBeNull();
  });

  it('does not render for assistant messages that already contain prompt tags', () => {
    const context = createContext(
      'Assistant <!--img-prompt="forest"--> message'
    );
    mockSillyTavern.getContext = vi.fn().mockReturnValue(context);
    appendMessageElement();

    addIndependentApiManualTriggerButtons(createSettings());

    expect(
      document.querySelector(`.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`)
    ).toBeNull();
  });

  it('does not render when prompt detection settings are invalid', () => {
    const context = createContext(
      'Assistant <!--img-prompt="forest"--> message'
    );
    mockSillyTavern.getContext = vi.fn().mockReturnValue(context);
    appendMessageElement();

    addIndependentApiManualTriggerButtons({
      ...createSettings(),
      promptDetectionPatterns: ['['],
    });

    expect(
      document.querySelector(`.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`)
    ).toBeNull();
  });

  it('clicking the trigger calls the shared Independent API flow and removes started buttons', async () => {
    const context = createContext();
    appendMessageElement();
    vi.mocked(runIndependentApiGenerationForMessage).mockResolvedValue({
      status: 'started',
      reason: 'started',
      promptCount: 1,
      insertedCount: 1,
      appendedCount: 0,
    });

    attachIndependentApiManualTriggerButton(0, context, createSettings());
    const button = document.querySelector(
      `.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    button?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(runIndependentApiGenerationForMessage).toHaveBeenCalledWith(
      0,
      context,
      createSettings(),
      'manual'
    );
    expect(
      document.querySelector(`.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`)
    ).toBeNull();
  });

  it('disables active-session buttons and does not call the helper on click', () => {
    const context = createContext();
    appendMessageElement();
    mockSessionManager.isActive.mockReturnValue(true);

    attachIndependentApiManualTriggerButton(0, context, createSettings());
    const button = document.querySelector(
      `.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`
    ) as HTMLButtonElement | null;

    expect(button?.disabled).toBe(true);
    button?.click();
    expect(runIndependentApiGenerationForMessage).not.toHaveBeenCalled();
  });

  it('disables the trigger while Independent API prompt generation is pending', () => {
    const context = createContext();
    appendMessageElement();
    vi.mocked(isIndependentApiGenerationPending).mockReturnValue(true);

    attachIndependentApiManualTriggerButton(0, context, createSettings());
    const button = document.querySelector(
      `.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`
    ) as HTMLButtonElement | null;

    expect(button?.disabled).toBe(true);
    button?.click();
    expect(runIndependentApiGenerationForMessage).not.toHaveBeenCalled();
  });

  it('removes the trigger when prompt tags were inserted but session start failed', async () => {
    const context = createContext();
    appendMessageElement();
    vi.mocked(runIndependentApiGenerationForMessage).mockResolvedValue({
      status: 'failed',
      reason: 'session-start-failed',
      promptCount: 1,
      insertedCount: 1,
      appendedCount: 0,
    });

    attachIndependentApiManualTriggerButton(0, context, createSettings());
    const button = document.querySelector(
      `.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    button?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(
      document.querySelector(`.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`)
    ).toBeNull();
  });
});
