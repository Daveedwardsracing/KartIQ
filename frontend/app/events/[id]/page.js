import DashboardShellV2 from "@/components/dashboard-shell-v2";

export default async function EventPage({ params }) {
  const { id } = await params;
  return <DashboardShellV2 initialScreen="Event Sessions" initialEventId={id} />;
}
