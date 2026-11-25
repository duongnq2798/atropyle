import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach } from 'vitest';

// Animations finish instantly in unit tests; timing is tested through timers, never through frames.
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
});
