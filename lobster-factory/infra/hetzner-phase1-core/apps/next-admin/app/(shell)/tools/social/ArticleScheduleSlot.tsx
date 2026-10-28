"use client";
// The article date/publish box calls /api/content, which a social door does not serve (content is optional, products.ts).
// Staff pages supply it through layout.tsx; with no provider (the door) SocialManager shows none, so the door's page
// closure never reaches /api/content or the service-role client.
import { createContext, type ComponentType } from "react";
import type { WpPost } from "./api";

export type ArticleScheduleProps = { article: WpPost; onChanged: () => Promise<void> };
export const ArticleScheduleContext = createContext<ComponentType<ArticleScheduleProps> | null>(null);
