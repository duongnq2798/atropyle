/**
 * One colour per heir, in order (globals.css `--atro-branch-1…5`, five = LIMITS.maxHeirs, contrast.test.ts): the share
 * splitter's parts and the heirs' dots. Branch 1 is the thread's gold. Literal class names, so Tailwind emits each.
 */
export const BRANCH_BG = ['bg-branch-1', 'bg-branch-2', 'bg-branch-3', 'bg-branch-4', 'bg-branch-5'] as const;
