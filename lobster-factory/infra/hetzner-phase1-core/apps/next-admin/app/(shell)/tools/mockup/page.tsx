import MockupStudioStaff from "./MockupStudioStaff";

export const metadata = { title: "Mockup Studio · Lobster Factory" };

export default function MockupPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Mockup Studio</span>
      </div>
      <MockupStudioStaff />
    </>
  );
}
