import WorkbenchEntry from "../video/WorkbenchEntry";

export const metadata = { title: "影音工作台 · Lobster Factory" };

// ScriptForge is the video workbench's 腳本 now (video-unify-plan-20261116 §4 U3, U11): this old URL opens it there.
export default function Page() {
  return <WorkbenchEntry open="script-forge" />;
}
