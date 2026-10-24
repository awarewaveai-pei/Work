import TarotStudioStaff from "./TarotStudioStaff";

export const metadata = { title: "Tarot Print Generator · Lobster Factory" };

export default function TarotToolPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Tarot Print Generator</span>
      </div>
      <TarotStudioStaff />
    </>
  );
}
