import ProjectsList from "./ProjectsList";

export const metadata = { title: "影片專案 · Lobster Factory" };

export default function VideoProjectsPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">影片專案</span>
        <span className="topbar-env">所有做過的影片與成片</span>
      </div>
      <ProjectsList />
    </>
  );
}
