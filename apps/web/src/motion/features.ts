// Loaded with import() by MotionProvider, so the features of the m.* components, and the animation engine with them,
// stay out of the first-load bundle. A static animate or useAnimate import would bring the engine back: HoldButton
// shakes with a CSS keyframe instead (test/unit/motion-imports.test.ts).
export { domMax as default } from 'motion/react';
