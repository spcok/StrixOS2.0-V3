import { createFileRoute } from '@tanstack/react-router';
import Dashboard from '../components/dashboard/Dashboard';

export const Route = createFileRoute('/')({
  component: IndexRoute,
});

function IndexRoute() {
  return <Dashboard />;
}

export default IndexRoute;