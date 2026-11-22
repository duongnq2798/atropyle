import type { AppEnv } from './env';
import type { KV } from './lib/store';
import type { WalletWindow } from './lib/wallet';
import { RouteView } from './routes';
import { AppProvider } from './ui/app-context';
import { Shell } from './ui/shell';
import { useRoute } from './ui/use-route';

export function App(props: { env: AppEnv; kv: KV; win: WalletWindow; languages: readonly string[] }) {
  const route = useRoute();
  return (
    <AppProvider env={props.env} kv={props.kv} win={props.win} languages={props.languages}>
      <Shell route={route}>
        <RouteView route={route} />
      </Shell>
    </AppProvider>
  );
}
