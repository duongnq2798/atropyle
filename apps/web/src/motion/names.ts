/**
 * The view-transition name of the page's one shared thread: the root of `<Thread shared>`, or the thread layer of the
 * home page's weave. The thread morphs from one route to the next instead of cutting; globals.css gives its group the
 * spring (spec §4.1 "shared element"). At most one element per page: a name used twice aborts the whole transition.
 * A plain module, not a client one: a server component that imported it from view-transition.tsx would get a client
 * reference, not the string.
 */
export const THREAD_VT_NAME = 'atropyle-thread';
