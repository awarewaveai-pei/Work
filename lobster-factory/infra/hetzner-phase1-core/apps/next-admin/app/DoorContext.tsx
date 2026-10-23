"use client";
// Whether a page renders on a product door (ADR 018 §2). ProductDoorShell sets it; staff pages leave it false.
// A shared component that links to a staff page (/tools/*, /ops/*) hides that link on a door, where staff pages 404.
import { createContext, useContext, type ReactNode } from "react";

const OnDoor = createContext(false);

export function DoorProvider({ children }: { children: ReactNode }) {
  return <OnDoor.Provider value>{children}</OnDoor.Provider>;
}

export const useOnDoor = () => useContext(OnDoor);
