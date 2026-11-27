import type { Lang, Params } from '@/i18n/core';
import { ByLang, Say } from '@/i18n/say';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/count';
import { durationWords } from '@/lib/duration';
import { messages as home } from '@/messages/home.messages';
import { messages as story } from '@/messages/story.messages';
import { createHref, LIMITS_HREF, ROUTES } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { StateGlyph } from '@/thread/glyphs';
import { Thread } from '@/thread/thread';
import { buttonClass } from '@/ui/button-class';
import { CIRCUIT } from './hero-circuit';
import { DOOR } from './look';
import { Scene, SpineNode, SpineSeg, Stamp } from './scene';
import { beatsOf, DAY, INHERIT_DAYS, PERIOD_DAYS, STAGE_RUNS } from './sim-days';
import { AGENT_INSTALL, AGENT_LINES, type AgentLine, HEIR_SHARES } from './story-lines';

// The home page after the stage (spec §18.4.3 Task 7a). Server components only: their words are in the HTML in both
// languages (Say) and in no script, since / has no JavaScript to spare (7C-T6 report: 0.19 kB under R23's 200 kB).
// Every block shares the scenes' box, so the spine (home.css) runs down one line, and every link skips prefetch:
// nothing loads in Lighthouse's window, and /status/ and /developers/ are built by 7C T10 in a sibling branch.

/** The scenes' box (scene.tsx): one column edge for every block, so each piece of the spine lines up. */
const BOX = 'relative mx-auto w-full max-w-6xl px-4 sm:px-6';

/**
 * The arrow of a door, drawn by home.css (`.story-arrow`) as lucide's ArrowRight is drawn on the hero (ARROW of
 * look.ts): an empty span, so the closing scene's HTML stays inside its budget (T7A_GZIP; the SVG cost about 0.2 kB
 * gzip for three arrows, in the DOM and again in Next's payload).
 */
const arrow = <span aria-hidden="true" className="story-arrow" />;

/** A quiet paragraph between two scenes: real text in the Proclaim voice, which only rises (transform) as it enters. */
export function Quiet({ k }: { k: 'quiet1' | 'quiet2' }) {
  return (
    <div data-testid={`home-${k}`} className={cn(BOX, 'py-16 md:py-24')}>
      <SpineSeg />
      <p className="story-rise voice-proclaim relative max-w-4xl text-balance text-h2 lg:text-h1">
        <SpineNode />
        <Say m={story} k={k} />
      </p>
    </div>
  );
}

const cases = (lang: Lang) => formatCount(CIRCUIT.cases, lang);

/**
 * The trust band: every case of the policy circuit as one number, the circuit that decided every turn of the story
 * above (when assets may leave; the contracts decide who receives how much, PR #14), the edge of what the proof
 * covers, the way to run it, and the quiet way to the chain's live counts (/status/, PR #27).
 */
export function TrustBand() {
  return (
    <section
      id="trust"
      aria-labelledby="trust-title"
      data-testid="home-trust"
      className={cn(BOX, 'flex flex-col gap-8 py-20 md:py-28')}
    >
      <SpineSeg />
      {/* The number and its word rise together: the number alone, 1.5rem low as it enters, lay over the word. */}
      <h2 id="trust-title" className="story-rise flex flex-col gap-3">
        <span className="trust-cases voice-proclaim relative whitespace-nowrap text-thread tabular-nums">
          <SpineNode />
          <ByLang text={cases} />
        </span>
        {/* A space for the accessible name ("67,108,864 cases", not "67,108,864cases"); a flex container lays out no
            text node of white space alone, so the screen shows nothing of it. */}{' '}
        <span className="voice-proclaim text-ink text-title">
          <Say m={story} k="trustCases" />
        </span>
      </h2>
      <div className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-x-12">
        <p className="max-w-2xl text-pretty text-ink-muted text-lead lg:col-span-7">
          <Say m={story} k="trustLine" params={() => ({ nand: CIRCUIT.nands, latch: CIRCUIT.latches })} />{' '}
          <NavLink href={LIMITS_HREF} prefetch={false} className={cn(DOOR, 'whitespace-nowrap')}>
            <Say m={story} k="trustEdges" />
            {arrow}
          </NavLink>
        </p>
        <div className="flex flex-col items-start gap-4 lg:col-span-5">
          <NavLink href={ROUTES.proof} prefetch={false} className={buttonClass({ variant: 'secondary', size: 'lg' })}>
            <Say m={story} k="trustRun" />
          </NavLink>
          <NavLink href={ROUTES.status} prefetch={false} className={cn(DOOR, 'text-small')}>
            <Say m={story} k="trustStatus" />
            {arrow}
          </NavLink>
        </div>
      </div>
    </section>
  );
}

const WHO = { you: 'agentYou', agent: 'agentAgent' } as const;

/** The transcript's numbers: the stories' shares and days (sim-days.ts, story-lines.ts), never typed. */
function agentParams(lang: Lang): Params {
  return {
    a: HEIR_SHARES[0] / 100,
    b: HEIR_SHARES[1] / 100,
    period: durationWords(PERIOD_DAYS * Number(DAY), lang),
    alarm: INHERIT_DAYS.alarm,
    gate: INHERIT_DAYS.release,
  };
}

/**
 * One line of the transcript. A person speaks in the display face (the Letter voice's italic never loads on /,
 * R18.10), the agent in the body face, a tool call in the Ledger voice, in the thread's colour after the knot glyph.
 * The bubbles and the tool line are drawn by home.css (`.agent-say`, `.agent-tool`), not by utility classes: the
 * transcript's markup is in the HTML twice (the DOM and Next's payload), inside T7A_GZIP.
 */
function Line({ line }: { line: AgentLine }) {
  if (line.who === 'tool') {
    return (
      <li data-who="tool" className="agent-tool">
        <span className="sr-only">
          <Say m={story} k="agentTool" />:{' '}
        </span>
        <code translate="no" className="voice-ledger text-small">
          {line.tool}
        </code>
      </li>
    );
  }
  const you = line.who === 'you';
  return (
    <li data-who={line.who} className="agent-say">
      <span className="text-caption text-ink-muted">
        <Say m={story} k={WHO[line.who]} />
      </span>
      <span className={cn('text-pretty text-ink', you ? 'font-display text-lead' : 'text-body')}>
        <Say m={story} k={line.key} params={agentParams} />
      </span>
    </li>
  );
}

/** The agent band: a static transcript (spec §18.5 C8), one install command, the way to the other agents. */
export function AgentBand() {
  const start = beatsOf(STAGE_RUNS.confirm)[0].day;
  return (
    <Scene
      id="agent"
      stamp={
        <Stamp glyph="mark" tone="text-ink-muted">
          <Say m={story} k="agentStamp" params={() => ({ day: start })} />
        </Stamp>
      }
      title={<Say m={story} k="agentTitle" />}
      lead={<Say m={story} k="agentLead" />}
      attrs={{ 'data-testid': 'home-agent' }}
    >
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-x-12">
        <figure className="flex min-w-0 flex-col gap-4 rounded-3xl border border-line bg-surface-1 p-4 sm:p-6 lg:col-span-7">
          <ol data-testid="home-agent-transcript" className="flex flex-col gap-3">
            {AGENT_LINES.map((line) => (
              <Line key={line.who === 'tool' ? line.tool : line.key} line={line} />
            ))}
          </ol>
          <figcaption className="text-caption text-ink-muted">
            <Say m={story} k="agentCaption" />
          </figcaption>
        </figure>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5 lg:self-center">
          <h3 className="font-display text-ink text-title">
            <Say m={story} k="agentInstall" />
          </h3>
          {/* No copy button: CopyButton would bring motion, the clipboard and two message files into the first load
              of /. One tap selects the whole command; /developers/ has copy buttons (ruling R-T7a-5). */}
          <code
            translate="no"
            data-testid="home-agent-install"
            className="voice-ledger block select-all whitespace-pre-wrap wrap-anywhere rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-ink text-small"
          >
            {AGENT_INSTALL}
          </code>
          <NavLink href={ROUTES.developers} prefetch={false} className={cn(DOOR, 'self-start text-small')}>
            <Say m={story} k="agentMore" />
            {arrow}
          </NavLink>
        </div>
      </div>
    </Scene>
  );
}

/**
 * The closing scene: the product's mark, where the spine ends; the gate opened for two heirs at the stories' shares
 * (7C T7b splits it by the witness's real shares); the Drill offer with its cost, and the door for heirs.
 */
export function CloseScene() {
  return (
    <section
      id="rehearse"
      aria-labelledby="rehearse-title"
      data-testid="home-close"
      className={cn(BOX, 'flex flex-col gap-8 pt-20 pb-24 md:pt-28 md:pb-36')}
    >
      <SpineSeg end />
      <div className="relative flex size-14 items-center [--node-y:50%]">
        <SpineNode />
        <StateGlyph name="mark" size={56} className="text-thread" />
      </div>
      <div className="flex max-w-3xl flex-col gap-4">
        <h2 id="rehearse-title" className="voice-proclaim text-balance text-h1">
          <Say m={story} k="closeTitle" />
        </h2>
        <p className="text-pretty text-ink-muted text-lead">
          <Say m={story} k="closeLead" />
        </p>
      </div>
      <Thread state="releasedInherit" branches={HEIR_SHARES} className="w-full max-w-3xl" />
      {/* The offer with its cost right under it, then the heirs' door on a line of its own: on a phone the door
          between the button and its note read as the note's subject. */}
      <div className="flex flex-col items-start gap-3">
        <NavLink
          href={createHref('drill')}
          prefetch={false}
          aria-describedby="rehearse-note"
          className={buttonClass({ variant: 'primary', size: 'lg' })}
        >
          <Say m={home} k="heroDrill" />
        </NavLink>
        <p id="rehearse-note" className="text-balance text-ink-muted text-small">
          <Say m={home} k="heroDrillNote" />
        </p>
        <NavLink href={ROUTES.verify} prefetch={false} className={cn(DOOR, 'mt-3')}>
          <Say m={home} k="heroHeirDoor" />
        </NavLink>
      </div>
    </section>
  );
}
