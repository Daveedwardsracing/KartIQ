import ReportTemplateView from "@/components/dashboard/report-template-view";

export default async function ReportTemplatePage({ searchParams }) {
  const params = await searchParams;
  return (
    <ReportTemplateView
      sessionId={params?.sessionId || ""}
      audience={params?.audience || "coach"}
      printMode={params?.print === "1"}
    />
  );
}
