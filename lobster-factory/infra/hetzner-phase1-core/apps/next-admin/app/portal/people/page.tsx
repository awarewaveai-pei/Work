// 成員授權 (ADR 021 G4, U19): reached as portal.aware-wave.com/people (nginx rewrite, as /launcher and /wallet). Data and
// every action are /portal/api/people; the unit is the signed-in customer's own.
import type { Metadata } from "next";
import { PeopleView } from "./PeopleView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "成員授權" };

export default function PortalPeoplePage() {
  return <PeopleView />;
}
