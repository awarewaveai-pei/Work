import { UNIT_FACTS } from "./toolsheets.generated";

/** The run form's fields that are the tool's units (its lessons units.items keys), in form order: the iceberg's four
 *  layers. None for a tool without a lesson or whose units are not form fields. The run page colours these by layer and
 *  the result page builds ②④⑥ from them. */
export function unitFields<F extends { key?: string }>(methodId: string, fields: F[]): F[] {
  const facts = UNIT_FACTS[methodId];
  return facts ? fields.filter((field) => facts.some((unit) => unit.key === field.key)) : [];
}

/** The whole run form is the tool's units (the iceberg's four boxes): each field wears its layer's colour and a blank one
 *  is an evidence gap, not a missing answer. One field that is not a unit keeps the ordinary form, required marks and all. */
export function formIsUnits<F extends { key?: string }>(methodId: string, fields: F[]): boolean {
  return fields.length > 0 && unitFields(methodId, fields).length === fields.length;
}
