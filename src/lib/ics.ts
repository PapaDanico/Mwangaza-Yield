// Minimal iCalendar (RFC 5545) generation for all-day financial events.
// No dependencies; output imports cleanly into Google/Apple/Outlook calendars.

export interface CalendarEvent {
  date: string; // YYYY-MM-DD (all-day)
  title: string;
  description?: string;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function buildICS(events: CalendarEvent[], calendarName = 'Mwangaza Yield'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mwangaza Yield//EN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const e of events) {
    const d = e.date.replace(/-/g, '');
    // Stable UID so re-imports update rather than duplicate.
    const uid = `${d}-${e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@mwangazayield`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${d}T000000Z`,
      `DTSTART;VALUE=DATE:${d}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(e.title)} tomorrow`,
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(events: CalendarEvent[], filename: string, calendarName?: string): void {
  const blob = new Blob([buildICS(events, calendarName)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
