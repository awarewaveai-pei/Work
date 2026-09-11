// Install the built-in blocks.
//
// Blocks self-register when their module is imported, which means a registry-driven caller that
// imports nothing finds an empty registry and crawls nothing — with no error. Importing this one
// module is how a caller says "give me the standard set".
//
// Kept OUT of lib/collect/index.ts on purpose: index.ts is the contract surface, and importing it
// must not drag the knowledge base (through sink/kb) into modules that only wanted the types.

import "@/lib/collect/collectors/http-html";
import "@/lib/collect/collectors/web-search";
import "@/lib/collect/collectors/academic";
import "@/lib/collect/collectors/local-file";
import "@/lib/collect/collectors/video";
import "@/lib/collect/collectors/http-api";
import "@/lib/collect/collectors/sitemap";
import "@/lib/collect/collectors/rss";
import "@/lib/collect/collectors/extract-provider";
import "@/lib/collect/sinks/null";
import "@/lib/collect/sinks/signal";
import "@/lib/collect/sinks/kb";

export { collectors, sinks, collectorById, sinkById } from "@/lib/collect/registry";
