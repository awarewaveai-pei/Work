import ProjectDetail from "../ProjectDetail";

export const metadata = { title: "影片專案 · Lobster Factory" };

export default async function VideoProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">影片專案</span>
        <span className="topbar-env"><a href="/tools/video/projects" style={{ color: "inherit" }}>← 全部專案</a></span>
      </div>
      <ProjectDetail id={id} />
    </>
  );
}
