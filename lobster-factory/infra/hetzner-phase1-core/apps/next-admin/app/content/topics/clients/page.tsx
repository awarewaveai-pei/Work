import { DoorTopicsBoard } from "../DoorTopicsBoard";

export const metadata = { title: "客戶" };

// content.<base domain>/topics/clients, as staff open it at /tools/content/topics/clients.
export default function ContentDoorTopicsClientsPage() {
  return <DoorTopicsBoard view="clients" />;
}
