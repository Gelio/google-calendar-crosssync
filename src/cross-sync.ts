import { partition } from "ramda";
import { calendarId, copiedEventPrefix, syncDays } from "./config";

const getStartOfDay = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const advanceByDays = (date: Date, daysToAdvance: number) => {
  const advancedDate = new Date(date);
  advancedDate.setDate(date.getDate() + daysToAdvance);
  return advancedDate;
};

export function listEvents() {
  const events = Calendar.Events?.list(calendarId, {
    singleEvents: true,
    timeMin: getStartOfDay().toISOString(),
    timeMax: advanceByDays(getStartOfDay(), syncDays).toISOString(),
    maxResults: 2500,
  })!;

  const [copiedEvents, originalEvents] = partition(
    (event) => event.summary?.startsWith(copiedEventPrefix)!,
    events.items!
  );

  console.log(copiedEvents);
  console.log(originalEvents);
}
