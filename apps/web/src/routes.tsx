import type { Route } from './lib/route';
import { CreatePage } from './pages/create';
import { HomePage } from './pages/home';
import { BadAddressPage, NotFoundPage } from './pages/not-found';
import { ProofPage } from './pages/proof';
import { SignPage } from './pages/sign';
import { VerifyPage } from './pages/verify';
import { RequireSdk } from './ui/components';

/** Later tasks add one `case` per page, right before `default`. */
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
    case 'create':
      return (
        <RequireSdk>
          {(sdk) => <CreatePage key={route.drill ? 'drill' : 'real'} sdk={sdk} drill={route.drill} />}
        </RequireSdk>
      );
    case 'home':
      return <RequireSdk>{(sdk) => <HomePage sdk={sdk} />}</RequireSdk>;
    default:
      return <NotFoundPage path={route.name === 'notFound' ? route.path : `/${route.name}`} />;
  }
}
