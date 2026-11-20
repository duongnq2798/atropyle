import type { Route } from './lib/route';
import { BadAddressPage, NotFoundPage } from './pages/not-found';
import { SignPage } from './pages/sign';
import { RequireSdk } from './ui/components';

/** Later tasks add one `case` per page, right before `default`. */
export function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'badAddress':
      return <BadAddressPage input={route.input} />;
    case 'sign':
      return <RequireSdk>{(sdk) => <SignPage sdk={sdk} />}</RequireSdk>;
    default:
      return <NotFoundPage path={route.name === 'notFound' ? route.path : `/${route.name}`} />;
  }
}
