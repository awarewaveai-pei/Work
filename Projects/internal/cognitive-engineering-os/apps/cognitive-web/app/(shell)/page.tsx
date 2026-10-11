import { HomeStart } from "../../components/HomeStart";

// Home (ENTRY_SLICE1_CHECKLIST.md items 2-3; design: agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/
// platform-entry-design.html): one sentence, then two doors -- 陪我思考 and 直接分析. No tool count, goal cards or popular
// tools here any more; they live behind 直接分析 (app/(shell)/analyze/page.tsx).
export default function HomePage() {
  return (
    <section className="view" id="home">
      <div className="top">
        <div>
          <h1>把一件事想清楚</h1>
          <div className="sub">結論由你下。AI 在旁邊幫你看、幫你問、幫你查。</div>
        </div>
      </div>
      <HomeStart />
    </section>
  );
}
