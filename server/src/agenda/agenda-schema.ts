import { z } from "zod";
import { config } from "../config";
import { nullableJsonInteger, strictJsonObject, writtenText } from "../decision/schema-fields";

const LAST_HOUR = 23;

/** An hour of the day an item has to happen at; null when it has none. */
export const agendaHourSchema = z.number().int().min(0).max(LAST_HOUR).nullable().default(null);

/** One agenda item as a day plan or a decision writes it. */
export const plannedItemSchema = z.object({
  text: writtenText(config.agenda.itemMaxChars).min(1),
  hour: agendaHourSchema,
});

export const PLANNED_ITEM_JSON = strictJsonObject({
  text: { type: "string" },
  hour: nullableJsonInteger(),
});
