import {createLogger} from './logger';
import {t} from './i18n';
import {isIndependentApiMode} from './mode_utils';
import {extractImagePromptsMultiPattern} from './regex';
import {sessionManager} from './session_manager';
import {runIndependentApiGenerationForMessage} from './message_handler';

const logger = createLogger('ManualIndependentTrigger');

export const INDEPENDENT_MANUAL_TRIGGER_CLASS =
  'auto_illustrator_independent_manual_trigger';

function removeTriggerButton(messageEl: Element): void {
  messageEl.querySelector(`.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`)?.remove();
}

export function addIndependentApiManualTriggerButtons(
  settings: AutoIllustratorSettings
): void {
  const context = SillyTavern.getContext();
  if (!context?.chat) {
    logger.warn(
      'Cannot add Independent API manual triggers: no context or chat'
    );
    return;
  }

  if (
    !settings.enabled ||
    !isIndependentApiMode(settings.promptGenerationMode)
  ) {
    removeIndependentApiManualTriggerButtons();
    return;
  }

  context.chat.forEach((_message: unknown, messageId: number) => {
    attachIndependentApiManualTriggerButton(messageId, context, settings);
  });
}

export function attachIndependentApiManualTriggerButton(
  messageId: number,
  context: SillyTavernContext,
  settings: AutoIllustratorSettings
): void {
  const message = context.chat?.[messageId];
  const messageEl = document.querySelector(
    `.mes[mesid="${messageId}"]`
  ) as HTMLElement | null;

  if (!message || !messageEl) {
    return;
  }

  if (message.is_user) {
    removeTriggerButton(messageEl);
    return;
  }

  try {
    const prompts = extractImagePromptsMultiPattern(
      message.mes || '',
      settings.promptDetectionPatterns || []
    );
    if (prompts.length > 0) {
      removeTriggerButton(messageEl);
      return;
    }
  } catch (error) {
    logger.error('Error detecting existing prompt tags:', error);
  }

  const existingButton = messageEl.querySelector(
    `.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`
  ) as HTMLButtonElement | null;
  if (existingButton) {
    existingButton.disabled = sessionManager.isActive(messageId);
    return;
  }

  const button = document.createElement('button');
  const buttonTitle = t('button.manualIndependentGenerate');
  button.type = 'button';
  button.className = `menu_button menu_button_icon ${INDEPENDENT_MANUAL_TRIGGER_CLASS}`;
  button.title = buttonTitle;
  button.setAttribute('aria-label', buttonTitle);
  button.innerHTML =
    '<i class="fa-solid fa-wand-magic-sparkles"></i><span>' +
    t('button.manualIndependentGenerateShort') +
    '</span>';
  button.disabled = sessionManager.isActive(messageId);

  button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();

    if (sessionManager.isActive(messageId)) {
      toastr.warning(t('toast.cannotManualWhileStreaming'), t('extensionName'));
      return;
    }

    button.disabled = true;
    button.classList.add('is-running');
    button.title = t('button.manualIndependentRunning');

    try {
      const result = await runIndependentApiGenerationForMessage(
        messageId,
        context,
        settings,
        'manual'
      );

      if (result.status === 'started') {
        button.remove();
        return;
      }
    } catch (error) {
      logger.error('Unexpected Independent API manual trigger error:', error);
      toastr.warning(t('toast.llmPromptGenerationFailed'), t('extensionName'));
    }

    button.disabled = false;
    button.classList.remove('is-running');
    button.title = buttonTitle;
  });

  const manualButton = messageEl.querySelector('.auto_illustrator_manual_gen');
  if (manualButton) {
    manualButton.insertAdjacentElement('afterend', button);
    return;
  }

  const container = messageEl.querySelector('.mes_buttons') ?? messageEl;
  container.append(button);
}

export function removeIndependentApiManualTriggerButtons(): void {
  document
    .querySelectorAll(`.${INDEPENDENT_MANUAL_TRIGGER_CLASS}`)
    .forEach(button => button.remove());
}
