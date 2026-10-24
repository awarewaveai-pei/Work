import MockupWithCatalog from "../../(shell)/tools/mockup/MockupWithCatalog";

export const metadata = { title: "模型圖" };

// design.<base domain>/mockup: the same mockup studio and Printful catalog as /tools/mockup.
export default function DesignMockupPage() {
  return <MockupWithCatalog />;
}
