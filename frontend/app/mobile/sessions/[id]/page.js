import DashboardShellV2 from "@/components/dashboard-shell-v2";

export default async function MobileSessionResultsPage({ params }) {
  const { id } = await params;
  return <DashboardShellV2 experienceMode="mobile" initialScreen="Session Results" initialSessionId={id} />;
}
