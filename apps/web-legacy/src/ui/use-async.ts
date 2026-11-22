import { useEffect, useState } from 'preact/hooks';

export type AsyncState<T> = { status: 'loading' } | { status: 'ok'; value: T } | { status: 'error'; error: unknown };

export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> & { reload(): void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    fn().then(
      (value) => live && setState({ status: 'ok', value }),
      (error: unknown) => live && setState({ status: 'error', error }),
    );
    return () => {
      live = false;
    };
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((x) => x + 1) };
}
