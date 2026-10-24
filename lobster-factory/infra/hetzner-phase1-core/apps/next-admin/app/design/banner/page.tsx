import BannerStudio from "../../(shell)/tools/banner/BannerStudio";

export const metadata = { title: "橫幅" };

// design.<base domain>/banner: Banner Studio without the staff extras (AI copy bills video.script and brand colours
// read the staff client list; decisions D-V2/D-V3), so those buttons do not show on the door.
export default function DesignBannerPage() {
  return <BannerStudio />;
}
