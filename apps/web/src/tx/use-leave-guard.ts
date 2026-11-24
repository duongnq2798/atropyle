import { useEffect } from 'react';

/**
 * While `active`, closing or reloading the tab asks the browser's own "Leave site?" question. Used while a plan has
 * steps the wallet accepted and steps still to send: the page holds the only copy of the remaining steps.
 */
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers show the question only when returnValue is set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [active]);
}
