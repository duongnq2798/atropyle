import { useT } from '../ui/app-context';
import { UntrustedText } from '../ui/components';
import { messages } from '../ui/shell.messages';

export function NotFoundPage({ path }: { path: string }) {
  const t = useT(messages);
  return (
    <section class="stack">
      <h1>{t('notFoundTitle')}</h1>
      <p>
        {t('notFoundBody')} <UntrustedText value={path} max={80} />
      </p>
      <a href="#/">{t('goHome')}</a>
    </section>
  );
}

export function BadAddressPage({ input }: { input: string }) {
  const t = useT(messages);
  return (
    <section class="stack">
      <h1>{t('badAddressTitle')}</h1>
      <p>{t('badAddressBody')}</p>
      <p class="mono wrap-anywhere">
        <UntrustedText value={input} max={64} />
      </p>
      <a href="#/">{t('goHome')}</a>
    </section>
  );
}
