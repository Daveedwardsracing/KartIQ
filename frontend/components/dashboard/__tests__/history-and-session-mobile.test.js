import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/components/dashboard/analysis-panels", () => ({
  SavedReportsPanel: ({ reports }) => <div data-testid="saved-reports-panel">{reports.length} reports</div>,
}));

jest.mock("@/components/dashboard/telemetry-charts", () => ({
  DistancePlaybackChart: () => <div data-testid="distance-playback-chart" />,
  CustomLapMetricChart: () => <div data-testid="custom-lap-metric-chart" />,
  LapMetricBarChart: () => <div data-testid="lap-metric-bar-chart" />,
}));

jest.mock("@/lib/tracks", () => ({
  buildGoogleStaticMapUrl: () => "",
  findTrackByName: () => null,
  getStaticMapViewport: () => null,
  getTrackMapCalibration: () => ({}),
  projectTracePointsToStage: () => [],
  projectTraceToStage: () => [],
}));

import { HistoryPanel, SessionResultsPage } from "@/components/dashboard/history-and-portals";

const sessions = [
  {
    id: "ses-123",
    event_round: "Round 1",
    event_name: "PF International",
    session_type: "Practice",
    created_at: "2026-04-08 09:45",
    status: "uploaded",
    analysis: { drivers: [{ driver_name: "Josh Robinson" }] },
  },
];

const selectedSessionDetail = {
  session: {
    id: "ses-123",
    event_round: "Round 1",
    event_name: "PF International",
    session_type: "Practice",
    created_at: "2026-04-08 09:45",
    status: "uploaded",
    driver_count: 1,
    analysis: {
      drivers: [
        {
          driver_id: "drv-josh",
          driver_name: "Josh Robinson",
          canonical_driver_name: "Josh Robinson",
          best_lap: 58.321,
          top_speed: 71.4,
          max_rpm: 15200,
          lap_table: [
            { lap_number: 1, lap_time: 58.321, top_speed: 71.4, max_rpm: 15200 },
            { lap_number: 2, lap_time: 58.654, top_speed: 70.8, max_rpm: 15150 },
          ],
        },
      ],
      corner_analysis: [],
      sector_analysis: [],
    },
  },
  reports: [
    {
      id: "rep-driver",
      audience: "driver",
      title: "Driver Debrief",
      status: "draft",
      visible_to_driver: false,
      visible_to_parent: false,
      review_note: "",
      reviewed_at: "",
      published_at: "",
      report: {
        title: "Driver Debrief",
        overall_summary: "Strong opening run.",
        confidence_rating: "High",
        action_points: ["Carry more speed into Turn 1."],
      },
    },
  ],
  presets: [],
  notes: [],
};

describe("mobile history and session views", () => {
  it("renders the dedicated mobile history experience", () => {
    render(
      <HistoryPanel
        sessions={sessions}
        selectedSessionId="ses-123"
        selectedSessionDetail={selectedSessionDetail}
        onSelectSession={jest.fn()}
        onOpenSession={jest.fn()}
        onDeleteSession={jest.fn()}
        mobileExperience
      />
    );

    expect(screen.getByText("Mobile History")).toBeInTheDocument();
    expect(screen.getByText("Reopen sessions quickly from the phone.")).toBeInTheDocument();
    expect(screen.getByText("Latest runs first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  });

  it("renders and switches through the dedicated mobile session tabs", () => {
    render(
      <SessionResultsPage
        selectedSessionDetail={selectedSessionDetail}
        loading={false}
        tracks={[]}
        mapsApiKey=""
        speedUnit="kmh"
        mobileExperience
        onBack={jest.fn()}
        onDeleteSession={jest.fn()}
        onGenerateFeedback={jest.fn()}
        onExportPdf={jest.fn()}
        onSessionStatusChange={jest.fn()}
        onPublishReport={jest.fn()}
        onOpenReportStudio={jest.fn()}
        onSavePreset={jest.fn()}
        onDeletePreset={jest.fn()}
        onSaveCoachingNote={jest.fn()}
        onDeleteCoachingNote={jest.fn()}
        onSaveTrackMarkerDefaults={jest.fn()}
      />
    );

    expect(screen.getByText("Mobile Session")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Laps" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publishing" })).toBeInTheDocument();
    expect(screen.getByText("Fastest laps at a glance")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Laps" }));
    expect(screen.getByText("Lap summary")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publishing" }));
    expect(screen.getByText("Generate and share")).toBeInTheDocument();
    expect(screen.getAllByText("Publish to driver").length).toBeGreaterThan(0);
  });
});
