import type { Route } from './lib/route';
import { CreatePage } from './pages/create';
import { DevelopersPage } from './pages/developers';
import { HomePage } from './pages/home';
import { BadAddressPage, NotFoundPage } from './pages/not-found';
import { ProofPage } from './pages/proof';
import { SignPage } from './pages/sign';
import { StatusPage } from './pages/status';
import { VaultPage } from './pages/vault';
import { VerifyPage } from './pages/verify';
import { RequireSdk } from './ui/components';

/** One `case` per route; the switch is exhaustive. */
export function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'badAddress':
      return <BadAddressPage input={route.input} />;
    case 'proof':
      return <RequireSdk>{(sdk) => <ProofPage sdk={sdk} />}</RequireSdk>;
    case 'sign':
      return <RequireSdk>{(sdk) => <SignPage sdk={sdk} />}</RequireSdk>;
    case 'verify':
      return <RequireSdk>{(sdk) => <VerifyPage sdk={sdk} vault={route.vault} />}</RequireSdk>;
    case 'home':
      return <RequireSdk>{(sdk) => <HomePage sdk={sdk} />}</RequireSdk>;
    case 'create':
      return (
        <RequireSdk>
          {(sdk) => <CreatePage key={route.drill ? 'drill' : 'real'} sdk={sdk} drill={route.drill} />}
        </RequireSdk>
      );
    case 'vault':
      return <RequireSdk>{(sdk) => <VaultPage key={route.vault} sdk={sdk} vault={route.vault} />}</RequireSdk>;
    case 'status':
      return <RequireSdk>{(sdk) => <StatusPage sdk={sdk} />}</RequireSdk>;
    case 'developers':
      return <RequireSdk>{(sdk) => <DevelopersPage sdk={sdk} />}</RequireSdk>;
    case 'notFound':
      return <NotFoundPage path={route.path} />;
  }
}
