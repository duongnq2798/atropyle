import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import { type CSSProperties, Fragment } from 'react';
import { COPY } from '../src/email/copy';
import { type EmailKind, FACTS, MONO_FACTS, THREAD } from '../src/email/kinds';
import { BUTTON, DARK, FONTS, LIGHT, TONES } from '../src/email/theme';
import type { Lang } from '../src/types';
import { Thread } from './Thread';

const SERIF = FONTS.serif;
const SANS = FONTS.sans;
const MONO = FONTS.mono;

/**
 * The dark set of spec §4.3 for clients that honour prefers-color-scheme (Apple Mail, Outlook on Mac and iOS).
 * Inline styles carry the light set. No quotes or angle brackets here: React may escape them inside <style>.
 */
export function darkCss(): string {
  const tones = TONES.map(
    (t) => `.at-fill-${t}{background-color:${DARK[t]} !important}.at-text-${t}{color:${DARK[t]} !important}`,
  ).join('');
  return [
    ':root{color-scheme:light dark;supported-color-schemes:light dark}',
    '@media (prefers-color-scheme: dark){',
    `.at-bg{background-color:${DARK.bg} !important}`,
    `.at-card{background-color:${DARK.surface1} !important;border-color:${DARK.surface3} !important}`,
    `.at-well{background-color:${DARK.surface2} !important}`,
    `.at-gap{background-color:${DARK.surface1} !important}`,
    `.at-track{background-color:${DARK.surface3} !important}`,
    `.at-ink{color:${DARK.ink} !important}`,
    `.at-muted{color:${DARK.muted} !important}`,
    `.at-never{border-left-color:${DARK.thread} !important}`,
    tones,
    '}',
  ].join('');
}

const st = {
  body: { fontFamily: SANS, margin: '0', padding: '32px 0 40px' },
  container: { maxWidth: '560px', margin: '0 auto', padding: '0 16px' },
  masthead: { padding: '0 4px 18px' },
  wordmark: {
    fontFamily: SERIF,
    fontSize: '22px',
    lineHeight: '28px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: LIGHT.ink,
    margin: '0',
  },
  chip: {
    fontFamily: MONO,
    fontSize: '11px',
    lineHeight: '28px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    textAlign: 'right',
    margin: '0',
  },
  card: {
    backgroundColor: LIGHT.surface1,
    border: `1px solid ${LIGHT.surface3}`,
    borderRadius: '16px',
    overflow: 'hidden',
  },
  inner: { padding: '28px 32px 8px' },
  h1: {
    fontFamily: SERIF,
    fontSize: '28px',
    lineHeight: '34px',
    fontWeight: 600,
    letterSpacing: '-0.015em',
    color: LIGHT.ink,
    margin: '0 0 16px',
  },
  p: { fontSize: '16px', lineHeight: '26px', color: LIGHT.ink, margin: '0 0 14px' },
  facts: { padding: '4px 0 6px' },
  label: {
    fontFamily: MONO,
    fontSize: '11px',
    lineHeight: '16px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: LIGHT.muted,
    margin: '0',
  },
  value: { fontSize: '16px', lineHeight: '24px', color: LIGHT.ink, margin: '2px 0 14px' },
  mono: {
    fontFamily: MONO,
    fontSize: '14px',
    lineHeight: '22px',
    color: LIGHT.ink,
    margin: '2px 0 14px',
    wordBreak: 'break-all',
  },
  cta: { padding: '10px 0 22px' },
  button: {
    backgroundColor: BUTTON.background,
    color: BUTTON.text,
    fontFamily: SANS,
    fontSize: '16px',
    fontWeight: 600,
    lineHeight: '24px',
    textDecoration: 'none',
    borderRadius: '999px',
    padding: '12px 26px',
    display: 'inline-block',
  },
  note: { fontSize: '14px', lineHeight: '22px', color: LIGHT.muted, margin: '0 0 22px' },
  well: { backgroundColor: LIGHT.surface2, padding: '20px 32px 22px' },
  address: {
    fontFamily: MONO,
    fontSize: '15px',
    lineHeight: '24px',
    letterSpacing: '0.02em',
    color: LIGHT.ink,
    margin: '4px 0 6px',
    wordBreak: 'break-all',
  },
  small: { fontSize: '13px', lineHeight: '20px', color: LIGHT.muted, margin: '0 0 10px' },
  footer: { padding: '24px 8px 0' },
  never: {
    fontSize: '14px',
    lineHeight: '22px',
    color: LIGHT.ink,
    margin: '0 0 14px',
    borderLeft: `3px solid ${LIGHT.thread}`,
    paddingLeft: '12px',
  },
  link: { color: LIGHT.muted, textDecoration: 'underline' },
} satisfies Record<string, CSSProperties>;

/** One email, with {{placeholders}} that compose.ts fills in at send time. */
export function Email({ kind, lang }: { kind: EmailKind; lang: Lang }) {
  const c = COPY[lang];
  const k = c.kinds[kind];
  const thread = THREAD[kind];
  const facts = FACTS[kind];
  return (
    <Html lang={lang}>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{darkCss()}</style>
      </Head>
      <Preview>{k.preheader}</Preview>
      <Body className="at-bg" style={st.body}>
        <Container style={st.container}>
          <Section style={st.masthead}>
            <Row>
              <Column>
                <Text className="at-ink" style={st.wordmark}>
                  Atropyle
                </Text>
              </Column>
              <Column align="right">
                <Text style={st.chip}>
                  <span className={`at-text-${thread.tone}`} style={{ color: LIGHT[thread.tone] }}>
                    {'●'}
                  </span>
                  {'  '}
                  <span className="at-muted" style={{ color: LIGHT.muted }}>
                    {k.eyebrow}
                  </span>
                </Text>
              </Column>
            </Row>
          </Section>

          <Section className="at-card" style={st.card}>
            <Thread tone={thread.tone} progress={thread.progress} shape={thread.shape} />
            <Section style={st.inner}>
              <Heading as="h1" className="at-ink" style={st.h1}>
                {k.heading}
              </Heading>
              {k.body.map((p) => (
                <Text key={p} className="at-ink" style={st.p}>
                  {p}
                </Text>
              ))}
              {facts.length > 0 ? (
                <Section style={st.facts}>
                  {facts.map((f) => (
                    <Fragment key={f}>
                      <Text className="at-muted" style={st.label}>
                        {c.labels[f]}
                      </Text>
                      <Text className="at-ink" style={MONO_FACTS.has(f) ? st.mono : st.value}>
                        {`{{${f}}}`}
                      </Text>
                    </Fragment>
                  ))}
                </Section>
              ) : null}
              {kind === 'distributed' ? (
                <Section style={st.facts}>
                  <Text className="at-muted" style={st.label}>
                    {c.labels.transfers}
                  </Text>
                  {'{{{transfersHtml}}}'}
                </Section>
              ) : null}
              <Section style={st.cta}>
                <Button href="{{actionUrl}}" style={st.button}>
                  {k.cta}
                </Button>
              </Section>
              {k.note ? (
                <Text className="at-muted" style={st.note}>
                  {k.note}
                </Text>
              ) : null}
            </Section>
            <Section className="at-well" style={st.well}>
              <Text className="at-muted" style={st.label}>
                {c.labels.vault}
              </Text>
              <Text className="at-ink" style={st.address}>
                {'{{vaultGrouped}}'}
              </Text>
              <Text className="at-muted" style={st.small}>
                {c.labels.compare}
              </Text>
              <Text className="at-muted" style={st.label}>
                {c.labels.role}
              </Text>
              <Text className="at-ink" style={st.value}>
                {'{{roleLabel}}'}
              </Text>
            </Section>
          </Section>

          <Section style={st.footer}>
            <Text className="at-ink at-never" style={st.never}>
              {c.footer.never}
            </Text>
            <Text className="at-muted" style={st.small}>
              {c.footer.why}
            </Text>
            <Text className="at-muted" style={st.small}>
              <Link href="{{unsubscribeUrl}}" className="at-muted" style={st.link}>
                {c.footer.unsubscribe}
              </Link>
            </Text>
            <Text className="at-muted" style={st.small}>
              {c.footer.beta}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
