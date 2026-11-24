// Loaded with import() by MotionProvider, so the features of the m.* components, and the animation engine with them,
// stay out of the first-load bundle. That holds only while no static import reaches motion/react's own module, whose
// `motion` proxy carries every feature: so the m components come from motion/react-m, and MotionProvider takes
// LazyMotion and MotionConfig by name (ruling R23; test/unit/motion-imports.test.ts, test/build/first-load.test.ts).
// A static animate or useAnimate import would bring the engine back: HoldButton shakes with a CSS keyframe instead.
export { domMax as default } from 'motion/react';
