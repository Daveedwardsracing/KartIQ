import DashboardShellV2 from "@/components/dashboard-shell-v2";

export default async function MobileEventDetailPage({ params }) {
  const { id } = await params;
  return <DashboardShellV2 experienceMode="mobile" initialEventId={id} initialScreen="Event Sessions" />;
}
