import { HomeHero } from '@/home/hero';
import { WeaveArt } from '@/home/weave-svg';

/** The weave is a server component: its paths are in the HTML and in no script (test/build/home.test.ts). */
export default function HomePage() {
  return <HomeHero art={<WeaveArt />} />;
}
