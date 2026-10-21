"use client";
// Where the cards' pieces meet: SocialManager (C6, frame C19) with the views the later cards add (slots), on one route.
import { useRouter } from "next/navigation";
import Analytics from "./(sections)/analytics/Analytics";
import Ads from "./(sections)/ads/Ads";
import Inbox from "./(sections)/inbox/Inbox";
import Flows from "./Flows";
import Reporting from "./(sections)/reporting/Reporting";
import { ListDetail, ListsView } from "./Lists";
import LogView from "./LogView";
import Library from "./library/Library";
import { MembersSetting } from "./Members";
import { NeedsButton, ReviewSetting } from "./Review";
import type { SocialRoute } from "./routes";
import SmartLinks from "./smartlinks/SmartLinks";
import SocialManager, { type SlotContext, type Slots } from "./SocialManager";

// C7: the lists, and the open one beside them. Lists.tsx asks for the new-post editor after deleting a list: with no
// right column that means "close the list".
function ListsTab({ ctx }: { ctx: SlotContext }) {
  const c: SlotContext = { ...ctx, select: (s) => ctx.select(s.kind === "new" ? { kind: "none" } : s) };
  return (
    <div className="sm-split">
      <ListsView ctx={c} selectedId={ctx.listId ?? null} />
      {ctx.listId !== undefined ? <ListDetail key={ctx.listId ?? "new"} ctx={c} listId={ctx.listId} /> : <div className="sm-side sm-muted">請選擇左側清單，或按「＋ 新清單」建立。</div>}
    </div>
  );
}

const slots: Slots = {
  sideView: (view, ctx) => (view === "lists" ? <ListsTab ctx={ctx} />
    : view === "library" ? <Library ctx={ctx} />   // C31
    : view === "flows" ? <Flows ctx={ctx} />   // C27
    : view === "log" ? <LogView ctx={ctx} initialFilter={ctx.logFilter} />   // C11
    : null),
  headerExtra: (ctx) => <NeedsButton ctx={ctx} />,   // C8: the bell
  settingsExtra: (ctx) => <><ReviewSetting ctx={ctx} /><MembersSetting ctx={ctx} /></>,   // C8; members: ADR 018 §3
  section: (s, ctx) => (s === "analytics" ? <Analytics ctx={ctx} />   // C24
    : s === "ads" ? <Ads ctx={ctx} />   // C28
    : s === "reporting" ? <Reporting ctx={ctx} />   // C25
    : s === "smartlinks" ? <SmartLinks ctx={ctx} />   // C26
    : s === "inbox" ? <Inbox key={ctx.brand.id} ctx={ctx} />   // C29
    : null),
};

export default function SocialApp({ route = { kind: "plan" } }: { route?: SocialRoute }) {
  const router = useRouter();
  return <SocialManager slots={slots} route={route} go={(href, replace) => (replace ? router.replace(href) : router.push(href))} />;
}
