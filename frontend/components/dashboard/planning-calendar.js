import { useMemo, useState } from "react";
import { formatDateLabel } from "@/lib/dashboard-utils";

export default function PlanningCalendar({ eventsStore, onOpenEvent }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const monthLabel = cursor.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric"
  });

  const weeks = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const gridEnd = new Date(end);
    gridEnd.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));

    const dayEvents = new Map();
    eventsStore.forEach((eventItem) => {
      const startKey = eventItem.start_date || eventItem.date;
      const endKey = eventItem.end_date || eventItem.start_date || eventItem.date;
      if (!startKey) return;
      const span = eachIsoDay(startKey, endKey);
      span.forEach((key) => {
        const items = dayEvents.get(key) || [];
        items.push(eventItem);
        dayEvents.set(key, items);
      });
    });

    const weeksOut = [];
    const pointer = new Date(gridStart);
    while (pointer <= gridEnd) {
      const week = [];
      for (let index = 0; index < 7; index += 1) {
        const iso = toLocalIsoDate(pointer);
        week.push({
          iso,
          dayNumber: pointer.getDate(),
          inMonth: pointer.getMonth() === cursor.getMonth(),
          events: dayEvents.get(iso) || []
        });
        pointer.setDate(pointer.getDate() + 1);
      }
      weeksOut.push(week);
    }
    return weeksOut;
  }, [cursor, eventsStore]);

  const upcoming = useMemo(() => {
    const todayKey = toLocalIsoDate(new Date());
    return eventsStore
      .filter((item) => (item.start_date || item.date) && String(item.start_date || item.date) >= todayKey)
      .sort((left, right) => String(left.start_date || left.date).localeCompare(String(right.start_date || right.date)))
      .slice(0, 5);
  }, [eventsStore]);

  return (
    <div className="workspace-page">
      <section className="workspace-hero workspace-hero-premium">
        <div className="workspace-hero-premium-grid">
          <div className="workspace-hero-copy max-w-3xl">
            <p className="workspace-section-label">Planning Calendar</p>
            <h2 className="workspace-hero-title">See the season plan like a calendar wall, not a database list.</h2>
            <p className="workspace-hero-text">Every dated event appears here automatically so you can spot busy weeks, quiet weekends, and the next round at a glance.</p>
          </div>
          <div className="workspace-hero-grid">
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Events</p>
              <p className="workspace-kpi-value">{eventsStore.length}</p>
              <p className="workspace-kpi-detail">All dated events currently in the plan.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Upcoming</p>
              <p className="workspace-kpi-value">{upcoming.length}</p>
              <p className="workspace-kpi-detail">Events still ahead of today.</p>
            </div>
            <div className="workspace-kpi">
              <p className="workspace-kpi-label">Month view</p>
              <p className="workspace-kpi-value text-[1.1rem]">{monthLabel}</p>
              <p className="workspace-kpi-detail">Current planning window on the calendar.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="app-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="workspace-section-label">Month View</p>
              <h3 className="mt-2 text-2xl font-semibold">{monthLabel}</h3>
            </div>
            <div className="profile-actions">
              <button className="workspace-ghost px-4 py-2.5 text-sm" onClick={() => setCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} type="button">Previous</button>
              <button className="workspace-ghost px-4 py-2.5 text-sm" onClick={() => setCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} type="button">Next</button>
            </div>
          </div>

          <div className="calendar-scroll mt-5">
            <div className="calendar-grid">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                <div key={label} className="calendar-head">{label}</div>
              ))}
              {weeks.flat().map((day) => (
                <div key={day.iso} className={`calendar-cell ${day.inMonth ? "" : "calendar-cell-outside"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="calendar-day">{day.dayNumber}</span>
                    {day.events.length ? <span className="calendar-count">{day.events.length}</span> : null}
                  </div>
                  <div className="calendar-events">
                    {day.events.slice(0, 3).map((eventItem) => (
                      <button key={eventItem.id} className="calendar-event" onClick={() => onOpenEvent(eventItem)} type="button" title={`${eventItem.name} / ${eventItem.venue}`}>
                        <span className="calendar-event-title">{eventItem.name}</span>
                        <span className="calendar-event-meta">{eventItem.venue}</span>
                      </button>
                    ))}
                    {day.events.length > 3 ? <div className="calendar-more">+{day.events.length - 3} more</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="app-panel p-5">
          <div className="border-b border-white/10 pb-4">
            <p className="workspace-section-label">Upcoming Events</p>
            <h3 className="mt-2 text-2xl font-semibold">Next on the calendar</h3>
          </div>
          <div className="library-list mt-5">
            {upcoming.length ? upcoming.map((eventItem) => (
              <button key={eventItem.id} className="library-item" onClick={() => onOpenEvent(eventItem)} type="button">
                <p className="font-medium">{eventItem.name}</p>
                <p className="mt-1 text-sm muted">{eventItem.venue} / {eventItem.session_type || "Event"}</p>
                <p className="mt-3 text-xs muted">{formatEventDateRange(eventItem)}</p>
              </button>
            )) : (
              <div className="workspace-subtle-card p-6 text-sm muted">No dated events yet. Create an event with a date and it will appear here automatically.</div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}

function toLocalIsoDate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function eachIsoDay(startIso, endIso) {
  const [startYear, startMonth, startDay] = String(startIso).split("-").map(Number);
  const [endYear, endMonth, endDay] = String(endIso).split("-").map(Number);
  const start = new Date(startYear, (startMonth || 1) - 1, startDay || 1);
  const end = new Date(endYear, (endMonth || 1) - 1, endDay || 1);
  const days = [];
  const pointer = new Date(start);
  while (pointer <= end) {
    days.push(toLocalIsoDate(pointer));
    pointer.setDate(pointer.getDate() + 1);
  }
  return days;
}

function formatEventDateRange(eventItem) {
  const start = eventItem.start_date || eventItem.date;
  const end = eventItem.end_date || eventItem.start_date || eventItem.date;
  if (!start) return "No date";
  if (!end || end === start) return formatDateLabel(start);
  return `${formatDateLabel(start)} - ${formatDateLabel(end)}`;
}
