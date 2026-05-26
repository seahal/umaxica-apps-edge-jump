import { RailsHealthView, loadRailsHealthResult } from './rails-health';
import { getJitWorkspaceUrl } from '@/lib/jit-url';

export default async function RailsHealthPage() {
  const result = await loadRailsHealthResult(process.env.RAILS_API_URL);
  const workspaceUrl = getJitWorkspaceUrl('APP', 'CORE');

  return <RailsHealthView result={result} workspaceUrl={workspaceUrl} />;
}
