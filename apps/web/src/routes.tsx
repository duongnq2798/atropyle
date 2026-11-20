import type { Route } from './lib/route';
import { BadAddressPage, NotFoundPage } from './pages/not-found';

/** Later tasks add one `case` per page, right before `default`. */
export function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'badAddress':
      return <BadAddressPage input={route.input} />;
    default:
      return <NotFoundPage path={route.name === 'notFound' ? route.path : `/${route.name}`} />;
  }
}
