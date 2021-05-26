import {
  mainCalendarId,
  copiedEventPrefix,
  spreadsheetId,
  daysToSync,
  sheetsToCopy,
  mainCalendarSheetId,
  disableReminders,
} from "./config";
import { equals, groupBy, indexBy, omit, pick, prop } from "ramda";
import { advanceByDays, getStartOfDay } from "./date-utils";
import {
  CopiedEventDescriptor,
  EventDescriptor,
  getEventDescriptorFromCopiedEvent,
  getEventDescriptorFromRow,
  getEventFromDescriptor,
  getEventRowFromDescriptor,
} from "./event-descriptor";

function getMainCalendarEvents() {
  return Calendar.Events.list(mainCalendarId, {
    singleEvents: true,
    timeMin: getStartOfDay().toISOString(),
    timeMax: advanceByDays(getStartOfDay(), daysToSync).toISOString(),
    maxResults: 2500,
  });
}

const CALENDAR = {
  MAIN: "main",
  UNKNOWN: "unknown",
};

// TODO: add tests
const groupMainCalendarEvents = groupBy(
  ({ summary }: CopiedEventDescriptor) => {
    const copied = summary.startsWith(copiedEventPrefix);

    if (!copied) {
      return CALENDAR.MAIN;
    }

    const summaryWithoutCopiedEventPrefix = summary.slice(
      copiedEventPrefix.length
    );
    const matchingCalendarPrefix = sheetsToCopy.find((calendar) =>
      summaryWithoutCopiedEventPrefix.startsWith(calendar.prefix)
    )?.prefix;
    return matchingCalendarPrefix ?? CALENDAR.UNKNOWN;
  }
);

// TODO: add tests
const serializeEventDescriptorsToSheetValues = (
  descriptors: EventDescriptor[]
) => {
  const eventRows = descriptors.map(getEventRowFromDescriptor);
  const headerRow = Array.from({ length: eventRows[0]?.length ?? 1 }).fill("");
  headerRow[0] = eventRows.length;
  return [headerRow, ...eventRows];
};

// TODO: add tests
const deserializeEventDescriptorsFromSheetValues = (
  values: any[][]
): EventDescriptor[] => {
  const length = parseInt(values?.[0]?.[0], 10) || 0;

  if (length === 0) {
    return [];
  }
  return values.slice(1, length + 1).map(getEventDescriptorFromRow);
};

// TODO: add tests
const getRangeFromSheetValues = (sheetId: string, values: unknown[][]) =>
  `${sheetId}!A1:${getNthAlphabetLetter(
    Math.max(values?.[0]?.length ?? 0, 1)
  )}${values.length}`;

const saveEventDescriptorsToSpreadsheet = (
  sheetId: string,
  descriptors: EventDescriptor[]
) => {
  const valuesToSave = serializeEventDescriptorsToSheetValues(descriptors);
  const range = getRangeFromSheetValues(sheetId, valuesToSave);

  Sheets.Spreadsheets.Values.update(
    {
      majorDimension: "ROWS",
      range,
      values: valuesToSave,
    },
    spreadsheetId,
    range,
    { valueInputOption: "RAW" }
  );

  // TODO: cleanup stale rows if there were more previously and are not overwritten by this update
};

const getNthAlphabetLetter = (n: number) =>
  String.fromCharCode("A".charCodeAt(0) + n - 1);

export function run() {
  console.log("Getting events for the main calendar");
  const mainCalendarEvents = getMainCalendarEvents();
  const mainCalendarEventDescriptors = mainCalendarEvents.items.map(
    getEventDescriptorFromCopiedEvent
  );
  // TODO: ignore full-day events
  // TODO: remove unnecessary console.logs
  console.log(`Got ${mainCalendarEventDescriptors.length} events`);
  const groupedCalendarEvents = groupMainCalendarEvents(
    mainCalendarEventDescriptors
  );
  [
    ...sheetsToCopy.map(prop("prefix")),
    CALENDAR.MAIN,
    CALENDAR.UNKNOWN,
  ].forEach((prefix) => {
    if (!Array.isArray(groupedCalendarEvents[prefix])) {
      groupedCalendarEvents[prefix] = [];
    }
  });

  console.log(groupedCalendarEvents);

  const originalEventDescriptors = groupedCalendarEvents[CALENDAR.MAIN];
  console.log(
    `Saving ${originalEventDescriptors.length} original events to main calendar sheet ${mainCalendarSheetId}`
  );
  saveEventDescriptorsToSpreadsheet(
    mainCalendarSheetId,
    originalEventDescriptors
  );
  console.log(`Original events saved in sheet ${mainCalendarSheetId}`);

  console.log("Importing events from other sheets");
  sheetsToCopy.forEach((calendar) => {
    const sheetValues = Sheets.Spreadsheets.Values.get(
      spreadsheetId,
      calendar.sheetId
    ).values;
    const minEventStartDate = getStartOfDay().getTime();
    const eventDescriptorsToCopy = deserializeEventDescriptorsFromSheetValues(
      sheetValues
    ).filter(
      (descriptor) =>
        // TODO: ignore events from the past, clean up
        new Date(descriptor.startDateTime).getTime() >= minEventStartDate
    );
    const previouslyCopiedEventDescriptors =
      groupedCalendarEvents[calendar.prefix];

    console.log(
      `For calendar ${calendar.sheetId} got ${previouslyCopiedEventDescriptors.length} previously imported events and ${eventDescriptorsToCopy.length} events from the spreadsheet`
    );
    const { eventsToCreate, eventsToDelete } = reconcileEventsToCopy(
      eventDescriptorsToCopy,
      previouslyCopiedEventDescriptors
    );

    console.log(`Creating ${eventsToCreate.length} events`);
    eventsToCreate.forEach((descriptor) => {
      Calendar.Events.insert(
        getEventFromDescriptor(
          `${copiedEventPrefix}${calendar.prefix}`,
          disableReminders,
          calendar.colorId
        )(descriptor),
        mainCalendarId
      );
    });

    console.log(`Deleting ${eventsToDelete.length} events`);
    eventsToDelete.forEach((descriptor) =>
      Calendar.Events.remove(mainCalendarId, descriptor.id)
    );
  });

  const unknownCalendarEvents = groupedCalendarEvents[CALENDAR.UNKNOWN];
  if (unknownCalendarEvents.length > 0) {
    console.log(
      `Removing ${unknownCalendarEvents.length} events from an unknown calendar`
    );
    unknownCalendarEvents.forEach((descriptor) =>
      Calendar.Events.remove(mainCalendarId, descriptor.id)
    );
  }
}

// TODO: add tests
function reconcileEventsToCopy(
  eventDescriptorsToCopy: EventDescriptor[],
  previouslyCopiedEventDescriptors: CopiedEventDescriptor[]
) {
  const previouslyCopiedEventDescriptorsMap = indexBy(
    prop("copiedEventId"),
    previouslyCopiedEventDescriptors
  );

  const eventsToDelete: CopiedEventDescriptor[] = [];
  const eventsToCreate: EventDescriptor[] = [];

  Object.values(eventDescriptorsToCopy).forEach((descriptor) => {
    const previouslyCopiedEvent =
      previouslyCopiedEventDescriptorsMap[descriptor.id];

    if (!previouslyCopiedEvent) {
      console.log("Event is new", descriptor);
      eventsToCreate.push(descriptor);
    } else {
      const propertiesToCompareDirectly: (keyof EventDescriptor)[] = [
        "endDateTime",
        "startDateTime",
        // TODO: compare also the summary (but first remove the prefixes)
      ];
      const getComparableEventDescriptor = pick(propertiesToCompareDirectly);

      if (
        !equals(
          getComparableEventDescriptor(descriptor),
          getComparableEventDescriptor(previouslyCopiedEvent)
        )
      ) {
        console.log(descriptor, "differs from", previouslyCopiedEvent);
        eventsToDelete.push(previouslyCopiedEvent);
        eventsToCreate.push(descriptor);
      } else {
        // Event is already copied and did not change
      }
    }

    delete previouslyCopiedEventDescriptorsMap[descriptor.id];
  });

  // Remove stale copied events (copied ones for which the original event is removed)
  eventsToDelete.push(...Object.values(previouslyCopiedEventDescriptorsMap));

  return { eventsToDelete, eventsToCreate };
}
