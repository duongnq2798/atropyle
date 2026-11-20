import { useRoute } from './ui/use-route';

export function App() {
  const route = useRoute();
  return (
    <main class="page" data-route={route.name}>
      <h1>Atropyle</h1>
      <p class="beta">Beta — unaudited</p>
    </main>
  );
}
