// The same-origin download route for our public bucket objects (app/api/tools/designs/download): every door serves it.
// Fetching the bucket URL directly is cross-origin -- CORS blocks the fetch and <a download> is ignored.
export function bucketDownloadHref(url: string, filename?: string): string {
  return `/api/tools/designs/download?url=${encodeURIComponent(url)}${filename ? `&filename=${encodeURIComponent(filename)}` : ""}`;
}
