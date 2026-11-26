import type { Metadata } from 'next';
import { ENV } from '@/config/env';
import { shareMetadata } from '@/config/share-metadata';
import { HomeHero } from '@/home/hero';
import { HomeStage } from '@/home/stage';
import { WeaveArt } from '@/home/weave-svg';

// The link people post. On vercel its card carries og:url and the large image.
export const metadata: Metadata = shareMetadata(ENV.target, '/');

/**
 * The home page: the hero (Task 4, 5′), then the stage (Task 6); Task 7a adds the quiet paragraphs and the bands. The
 * weave is a server component: its paths are in the HTML and in no script (test/build/home.test.ts).
 */
export default function HomePage() {
  return (
    <>
      <HomeHero art={<WeaveArt />} />
      <HomeStage />
    </>
  );
}
