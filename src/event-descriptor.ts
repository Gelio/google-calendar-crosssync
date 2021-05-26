export interface EventDescriptor {
  id: string;
  summary: string;
  startDateTime: string;
  endDateTime: string;
}

export interface CopiedEventDescriptor extends EventDescriptor {
  copiedEventId: string;
}

export const getEventDescriptorFromEvent = (
  event: GoogleAppsScript.Calendar.Schema.Event
): EventDescriptor => ({
  id: event.id,
  summary: event.summary,
  startDateTime: event.start.dateTime,
  endDateTime: event.end.dateTime,
});
export const getEventDescriptorFromCopiedEvent = (
  event: GoogleAppsScript.Calendar.Schema.Event
): CopiedEventDescriptor => ({
  ...getEventDescriptorFromEvent(event),
  copiedEventId: event.description,
});

const eventDescriptorRowFields: (keyof EventDescriptor)[] = [
  "id",
  "summary",
  "startDateTime",
  "endDateTime",
];

export const getEventRowFromDescriptor = (descriptor: EventDescriptor) =>
  eventDescriptorRowFields.map((field) => descriptor[field]);
export const getEventDescriptorFromRow = (row: any[]): EventDescriptor =>
  Object.fromEntries(
    eventDescriptorRowFields.map((field, index) => [field, row[index]])
  ) as EventDescriptor;

export const getEventFromDescriptor =
  (summaryPrefix: string, disableReminders: boolean, colorId: string) =>
  (descriptor: EventDescriptor): GoogleAppsScript.Calendar.Schema.Event => ({
    summary: `${summaryPrefix} ${descriptor.summary}`,
    start: {
      dateTime: descriptor.startDateTime,
    },
    end: {
      dateTime: descriptor.endDateTime,
    },
    description: descriptor.id,
    reminders: {
      useDefault: !disableReminders,
    },
    colorId,
  });
