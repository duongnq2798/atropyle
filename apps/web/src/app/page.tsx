import type { Metadata } from 'next';
import { ENV } from '@/config/env';
import { shareMetadata } from '@/config/share-metadata';
import { AgentBand, CloseScene, Quiet, TrustBand } from '@/home/bands';
import { HomeHero } from '@/home/hero';
import { HomeStageIsland } from '@/home/stage-island';
import { WeaveArt } from '@/home/weave-svg';

// The link people post. On vercel its card carries og:url and the large image.
export const metadata: Metadata = shareMetadata(ENV.target, '/');

/**
 * The home page (spec §18.4.3 Task 7a): the hero (Task 4, 5′), then the story along its spine: a quiet paragraph, the
 * stage (Task 6), another, the trust band, the agent band and the closing scene. The weave and the bands are server
 * components: the weave's paths and the bands' words are in the HTML and in no script (test/build/home.test.ts). The
 * stage is prerendered whole, and its code loads after the first load (stage-island.tsx).
 */
export default function HomePage() {
  return (
    <>
      <HomeHero art={<WeaveArt />} />
      <div className="story">
        <Quiet k="quiet1" />
        <HomeStageIsland />
        <Quiet k="quiet2" />
        <TrustBand />
        {/* 7C T7b: the witness, "One life, on the record" (#record), goes here, after the trust band. */}
        <AgentBand />
        <CloseScene />
      </div>
    </>
  );
}
