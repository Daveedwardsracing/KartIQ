import { render, screen } from "@testing-library/react";

import ReportBuilderPanel from "@/components/dashboard/report-builder";

const baseSession = {
  id: "ses-123",
  event_name: "PF International",
  event_round: "Round 1",
  session_type: "Practice",
  status: "uploaded",
  analysis: {
    drivers: [{ driver_name: "Josh Robinson" }],
    sector_analysis: [{ sector_name: "Sector 1" }],
    corner_analysis: [{ name: "Turn 1" }],
  },
};

function renderPanel(overrides = {}) {
  return render(
    <ReportBuilderPanel
      sessionsStore={[{ id: "ses-123", event_name: "PF International", event_round: "Round 1", session_type: "Practice", driver_count: 1, created_at: "2026-04-08" }]}
      selectedSessionDetail={{
        session: baseSession,
        reports: [],
        notes: [],
        ...overrides.selectedSessionDetail,
      }}
      reportsStore={overrides.reportsStore || []}
      loading={false}
      generateNotice=""
      audience={overrides.audience || "coach"}
      mobileExperience={Boolean(overrides.mobileExperience)}
      onAudienceChange={jest.fn()}
      onSelectSession={jest.fn()}
      onGenerateFeedback={jest.fn()}
      onExportPdf={jest.fn()}
      onPublishReport={jest.fn()}
    />
  );
}

describe("ReportBuilderPanel", () => {
  it("renders audience-specific preview copy for driver reports", () => {
    renderPanel({
      audience: "driver",
      selectedSessionDetail: {
        reports: [
          {
            id: "rep-driver",
            audience: "driver",
            reports: [],
            status: "draft",
            visible_to_driver: false,
            visible_to_parent: false,
          },
        ],
      },
    });

    expect(screen.getAllByText("Driver debrief preview").length).toBeGreaterThan(0);
    expect(screen.getByText("What the driver will actually read before the next run.")).toBeInTheDocument();
    expect(screen.getByText("Publish to driver")).toBeInTheDocument();
  });

  it("does not show unpublish for a draft driver report that is not visible", () => {
    renderPanel({
      audience: "driver",
      selectedSessionDetail: {
        reports: [
          {
            id: "rep-driver",
            audience: "driver",
            reports: [],
            status: "draft",
            visible_to_driver: false,
            visible_to_parent: false,
          },
        ],
      },
      reportsStore: [
        {
          id: "rep-driver",
          audience: "driver",
          created_at: "2026-04-08T10:00:00",
          provider: "openai",
          model: "gpt-test",
          status: "draft",
          visible_to_driver: false,
          visible_to_parent: false,
        },
      ],
    });

    expect(screen.getAllByText("Publish to driver").length).toBeGreaterThan(0);
    expect(screen.queryByText("Unpublish driver report")).not.toBeInTheDocument();
    expect(screen.queryByText("Unpublish")).not.toBeInTheDocument();
  });

  it("renders the dedicated mobile report workflow", () => {
    renderPanel({
      audience: "parent",
      reportsStore: [
        {
          id: "rep-parent",
          audience: "parent",
          created_at: "2026-04-08T10:00:00",
          provider: "openai",
          model: "gpt-test",
          status: "reviewed",
          visible_to_driver: false,
          visible_to_parent: false,
          review_note: "Ready for family review.",
          reviewed_at: "2026-04-08T10:05:00",
          published_at: "",
        },
      ],
      selectedSessionDetail: {
        reports: [
          {
            id: "rep-parent",
            audience: "parent",
            reports: [
              {
                driver_name: "Josh Robinson",
                overall_summary: "Good progress all round.",
                headline: "Clear step forward",
                primary_focus: "Keep building confidence at Turn 1.",
              },
            ],
            status: "reviewed",
            visible_to_driver: false,
            visible_to_parent: false,
            review_note: "Ready for family review.",
            reviewed_at: "2026-04-08T10:05:00",
            published_at: "",
          },
        ],
      },
      mobileExperience: true,
    });

    expect(screen.getByText("Mobile Reports")).toBeInTheDocument();
    expect(screen.getByText("Generate and publish reports on the phone.")).toBeInTheDocument();
    expect(screen.getByText("Generate and export")).toBeInTheDocument();
    expect(screen.getAllByText("Publish to parent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Parent summary preview").length).toBeGreaterThan(0);
    expect(screen.getByText("Clear step forward")).toBeInTheDocument();
  });
});
