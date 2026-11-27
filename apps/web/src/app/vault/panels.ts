/**
 * The three role panels in one chunk (lazy-panels.tsx's panelsChunk). Connect preloads all three anyway
 * (preloadPanels), and apart, each carried its own copy of what they share (the alerts form, the signing card's
 * wrappers): the bundler copies a module into every lazy chunk that imports it.
 */
export { GuardianTab } from './guardian-tab';
export { HeirLetter } from './heir-letter';
export { OwnerTab } from './owner-tab';
