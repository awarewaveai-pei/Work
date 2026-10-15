"use client";
// Where the cards' pieces meet: SocialManager (C6) with the side views and panels the later cards add (slots).
import { ListDetail, ListsView } from "./Lists";
import LogView from "./LogView";
import { MembersSetting } from "./Members";
import MediaView from "./MediaView";
import { NeedsButton, ReviewSetting } from "./Review";
import SocialManager, { type Slots } from "./SocialManager";

const slots: Slots = {
  sideView: (view, ctx) => (view === "lists" ? <ListsView ctx={ctx} selectedId={null} />   // C7
    : view === "media" ? <MediaView ctx={ctx} />   // C9
    : view === "log" ? <LogView ctx={ctx} initialFilter={ctx.logFilter} />   // C11
    : null),
  rightPanel: (sel, ctx) => (sel.kind === "list" ? <ListDetail key={sel.id ?? "new"} ctx={ctx} listId={sel.id} /> : null),   // C7
  headerExtra: (ctx) => <NeedsButton ctx={ctx} />,   // C8
  settingsExtra: (ctx) => <><ReviewSetting ctx={ctx} /><MembersSetting ctx={ctx} /></>,   // C8; members: ADR 018 §3
};

export default function SocialApp() {
  return <SocialManager slots={slots} />;
}
