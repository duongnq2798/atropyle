import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach } from 'vitest';

// Animations finish instantly in unit tests; timing is tested through timers, never through frames.
MotionGlobalConfig.skipAnimations = true;

// findBy* and waitFor wait 5 s, not 1 s: a lazy chunk (a dynamic import) took over a second while every core was busy,
// and lazy-overlay-failures failed on it (parked 7B-T1). A passing wait still ends as soon as its check holds.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});
