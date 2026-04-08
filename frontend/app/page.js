import { headers } from "next/headers";
import { redirect } from "next/navigation";
import DashboardShellV2 from "@/components/dashboard-shell-v2";

function isMobileUserAgent(userAgent = "") {
  return /android|iphone|ipad|ipod|iemobile|opera mini|mobile/i.test(userAgent);
}

export default async function HomePage() {
  const headerStore = await headers();
  const userAgent = headerStore.get("user-agent") || "";

  if (isMobileUserAgent(userAgent)) {
    redirect("/mobile");
  }

  return <DashboardShellV2 initialScreen="Home" />;
}
