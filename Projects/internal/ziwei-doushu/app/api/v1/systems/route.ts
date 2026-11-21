import '@/lib/divination';
import { listSystems } from '@/lib/divination/registry';
import { describeSpec } from '@/lib/divination/input';
import { API_VERSION, v1Json, v1Preflight, v1RateLimited } from '@/lib/http/v1';

/** GET /api/v1/systems:所有已註冊系統與各自的輸入規格(欄位、範圍、說明、範例)。 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request) {
  const limited = v1RateLimited(request);
  if (limited) return limited;
  return v1Json({
    apiVersion: API_VERSION,
    systems: listSystems().map((s) => ({ id: s.meta.id, kind: s.meta.kind, input: describeSpec(s.input) })),
  });
}

export function OPTIONS() {
  return v1Preflight();
}
