import DashboardShellV2 from "@/components/dashboard-shell-v2";

export default async function SessionPage({ params }) {
  const { id } = await params;
  return <DashboardShellV2 initialScreen="Session Results" initialSessionId={id} />;
}
