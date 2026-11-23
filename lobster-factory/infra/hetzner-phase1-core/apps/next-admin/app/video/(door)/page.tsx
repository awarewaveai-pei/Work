import { redirect } from "next/navigation";

export const metadata = { title: "影片工作台" };

// video.<base domain>/ is the video workbench's shell (nginx/default.conf video block: `location = /` -> video-workbench).
// The old pipeline that answered here is gone (video-unify-plan-20261116 §4 U11); a request that still reaches this
// page (door menu, old link) goes to the workbench.
export default function VideoDoorPage(): never {
  redirect("/");
}
