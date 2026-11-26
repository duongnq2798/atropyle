import { AgentBand, CloseScene, Quiet, TrustBand } from '@/home/bands';
import { HomeHero } from '@/home/hero';
import { HomeStage } from '@/home/stage';
import { WeaveArt } from '@/home/weave-svg';

/**
 * The home page (spec §18.4.3 Task 7a): the hero (Task 4, 5′), then the story along its spine: a quiet paragraph, the
 * stage (Task 6), another, the trust band, the agent band and the closing scene. The weave and the bands are server
 * components: the weave's paths and the bands' words are in the HTML and in no script (test/build/home.test.ts).
 */
export default function HomePage() {
  return (
    <>
      <HomeHero art={<WeaveArt />} />
      <div className="story">
        <Quiet k="quiet1" />
        <HomeStage />
        <Quiet k="quiet2" />
        <TrustBand />
        {/* 7C T7b: the witness, "One life, on the record" (#record), goes here, after the trust band. */}
        <AgentBand />
        <CloseScene />
      </div>
    </>
  );
}
