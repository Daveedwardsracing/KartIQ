import { fireEvent, render, screen } from "@testing-library/react";

import SetupDatabasePage from "@/components/dashboard/setup-database-page";

const setupDatabase = {
  total_tracks: 1,
  total_entries: 2,
  entries: [
    { id: "one", upload_count: 1 },
    { id: "two", upload_count: 2 },
  ],
  tracks: [
    {
      track_name: "PF International",
      setup_count: 2,
      session_count: 2,
      driver_count: 2,
      upload_count: 3,
      latest_date: "2026-04-08",
      common_values: {
        rear_sprocket: [{ value: "80", count: 2 }],
      },
      recommended_baseline: {
        source: "derived",
        label: "Recommended baseline",
        notes: "Built from the strongest recent setup records at this track.",
        setup: { rear_sprocket: "80", front_tyre_pressure: "11.0" },
      },
      leaders: {
        best_lap: { driver_name: "Josh Robinson", value: 58.321 },
        best_sector_sum: { driver_name: "Josh Robinson", value: 57.9 },
        top_speed: { driver_name: "Ody Hole", value: 71.4 },
      },
      track: {
        id: "trk-pfi",
        setupNotes: [{ label: "Wet fallback", note: "Raise rear pressure slightly." }],
      },
      entries: [
        {
          id: "entry-josh",
          driver_name: "Josh Robinson",
          driver_number: "23",
          class_name: "Junior Rotax",
          session_name: "Morning Practice",
          session_type: "Practice",
          session_date: "2026-04-08",
          session_status: "planned",
          weather: "dry",
          track_condition: "Dry",
          tyre_condition: "New",
          upload_count: 1,
          outcome_score: 3,
          outcome_badges: ["Best lap leader"],
          setup: { rear_sprocket: "80", front_tyre_pressure: "11.0" },
          best_result: { best_lap: 58.321, lap_delta_to_fastest: 0, best_sector_sum: 57.9, top_speed: 70.8 },
        },
        {
          id: "entry-ody",
          driver_name: "Ody Hole",
          driver_number: "11",
          class_name: "Junior Rotax",
          session_name: "Afternoon Practice",
          session_type: "Practice",
          session_date: "2026-04-09",
          session_status: "analysed",
          weather: "wet",
          track_condition: "Wet",
          tyre_condition: "Used",
          upload_count: 2,
          outcome_score: 1,
          outcome_badges: ["Top speed leader"],
          setup: { rear_sprocket: "79", front_tyre_pressure: "10.5" },
          best_result: { best_lap: 58.9, lap_delta_to_fastest: 0.579, best_sector_sum: 58.3, top_speed: 71.4 },
        },
      ],
    },
  ],
};

describe("SetupDatabasePage", () => {
  it("renders track setup bank details and AI analysis call to action", () => {
    render(
      <SetupDatabasePage
        setupDatabase={setupDatabase}
        loading={false}
        onOpenPlannedSession={jest.fn()}
        onOpenUploadSession={jest.fn()}
        onSaveTrackConfig={jest.fn()}
        onAnalyseTrackSetups={jest.fn()}
      />
    );

    expect(screen.getAllByText("PF International").length).toBeGreaterThan(0);
    expect(screen.getByText("Ask the assistant to analyse this track setup bank")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyse setup database for this track" })).toBeInTheDocument();
    expect(screen.getAllByText("Josh Robinson").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ody Hole").length).toBeGreaterThan(0);
  });

  it("filters setup entries by weather text", () => {
    render(
      <SetupDatabasePage
        setupDatabase={setupDatabase}
        loading={false}
        onOpenPlannedSession={jest.fn()}
        onOpenUploadSession={jest.fn()}
        onSaveTrackConfig={jest.fn()}
        onAnalyseTrackSetups={jest.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Weather / condition"), {
      target: { value: "wet" },
    });

    expect(screen.getAllByRole("button", { name: "Compare" })).toHaveLength(1);
    expect(screen.getAllByText("Ody Hole").length).toBeGreaterThan(0);
  });

  it("renders the dedicated mobile setup database view", () => {
    render(
      <SetupDatabasePage
        setupDatabase={setupDatabase}
        loading={false}
        mobileExperience
        onOpenPlannedSession={jest.fn()}
        onOpenUploadSession={jest.fn()}
        onSaveTrackConfig={jest.fn()}
        onAnalyseTrackSetups={jest.fn()}
      />
    );

    expect(screen.getByText("Mobile Setup Database")).toBeInTheDocument();
    expect(screen.getByText("Browse saved setup patterns on the phone.")).toBeInTheDocument();
    expect(screen.getAllByText("Recommended baseline").length).toBeGreaterThan(0);
    expect(screen.getByText("Ask about this setup bank")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyse setup bank" })).toBeInTheDocument();
  });
});
