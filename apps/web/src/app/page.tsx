import type { Metadata } from 'next';
import { ENV } from '@/config/env';
import { shareMetadata } from '@/config/share-metadata';
import { HomeHero } from '@/home/hero';

// The link people post. On vercel its card carries og:url and the large image.
export const metadata: Metadata = shareMetadata(ENV.target, '/');

export default function HomePage() {
  return <HomeHero />;
}
