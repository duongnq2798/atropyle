'use client';

import { BellOff, CircleCheck, CloudOff, Globe, Unlink } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { useT } from '@/i18n/provider';
import { messages } from '@/messages/alerts.messages';
import { ErrorBox } from '@/tx/error-box';
import { Button } from '@/ui/button';
import { AlertsFrame, StateIcon } from '../alerts-view';
import { type UnsubscribeState, useUnsubscribeFlow } from '../token';

const ICON = { size: 22, strokeWidth: 1.5, 'aria-hidden': true } as const;

export interface UnsubscribeViewProps {
  state: UnsubscribeState;
  error: unknown;
  onStop(): void;
}

/**
 * Every state of /alerts/unsubscribe/. The backend answers 200 for any token (idempotent, spec §9.6), so there is no
 * "expired" state here. When the request settles the button leaves the page, and the focus goes to the title, which
 * says how it went.
 */
export function UnsubscribeView({ state, error, onStop }: UnsubscribeViewProps) {
  const t = useT(messages);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const was = useRef(state);
  useEffect(() => {
    if (was.current === 'working' && (state === 'done' || state === 'error')) titleRef.current?.focus();
    was.current = state;
  }, [state]);
  const note = state !== 'reading' && state !== 'invalid';

  let title: string;
  let said: string;
  let icon: ReactNode;
  let body: ReactNode = null;
  switch (state) {
    case 'reading':
      title = t('unsubTitle');
      said = t('saidReading');
      icon = <StateIcon tone="busy" />;
      break;
    case 'invalid':
      title = t('invalidTitle');
      said = title;
      icon = (
        <StateIcon tone="warn">
          <Unlink {...ICON} />
        </StateIcon>
      );
      body = <p className="text-pretty text-ink-muted text-lead">{t('invalidBody')}</p>;
      break;
    case 'hostedOnly':
      title = t('hostedOnlyTitle');
      said = title;
      icon = (
        <StateIcon tone="quiet">
          <Globe {...ICON} />
        </StateIcon>
      );
      body = <p className="text-pretty text-ink-muted text-lead">{t('hostedOnlyBody')}</p>;
      break;
    case 'ready':
    case 'working':
      title = t('unsubTitle');
      said = state === 'working' ? t('unsubWorking') : '';
      icon = (
        <StateIcon tone="quiet">
          <BellOff {...ICON} />
        </StateIcon>
      );
      body = (
        <div className="flex w-full flex-col items-start gap-4">
          <p className="text-pretty text-ink-muted text-lead">{t('unsubReady')}</p>
          <Button
            data-testid="alerts-stop"
            variant="primary"
            loading={state === 'working'}
            loadingLabel={t('unsubWorking')}
            icon={<BellOff aria-hidden="true" strokeWidth={1.5} />}
            onClick={onStop}
          >
            {t('unsubButton')}
          </Button>
          <p className="text-caption text-ink-muted">{t('unsubKeep')}</p>
        </div>
      );
      break;
    case 'error':
      title = t('unsubError');
      said = '';
      icon = (
        <StateIcon tone="warn">
          <CloudOff {...ICON} />
        </StateIcon>
      );
      body = <ErrorBox error={error} onRetry={onStop} className="w-full" />;
      break;
    case 'done':
      title = t('unsubDoneTitle');
      said = title;
      icon = (
        <StateIcon tone="ok">
          <CircleCheck {...ICON} />
        </StateIcon>
      );
      body = (
        <div className="flex flex-col gap-3">
          <p className="text-pretty text-ink-muted text-lead">{t('unsubDoneBody')}</p>
          <p className="text-ink-muted text-small">{t('unsubAgain')}</p>
        </div>
      );
      break;
  }

  return (
    <AlertsFrame state={state} title={title} icon={icon} said={said} note={note} titleRef={titleRef}>
      {body}
    </AlertsFrame>
  );
}

export function UnsubscribePage() {
  const f = useUnsubscribeFlow();
  return <UnsubscribeView state={f.state} error={f.error} onStop={f.stop} />;
}
