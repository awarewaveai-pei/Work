import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAROT_DECK } from './tarot';

const DIR = join(process.cwd(), 'public', 'tarot');
// SHA256.json 的雜湊取自來源專案 assets/cards/manifest.json(複製時逐檔核對過)
const SHA: Record<string, string> = JSON.parse(readFileSync(join(DIR, 'SHA256.json'), 'utf8'));

describe('塔羅牌圖', () => {
  it('78 張牌與牌背都有對應檔,且檔案雜湊與來源 manifest 一致', () => {
    const ids = [...TAROT_DECK.map((c) => c.id), 'back'];
    expect(Object.keys(SHA).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const file = join(DIR, `${id}.webp`);
      expect(existsSync(file), id).toBe(true);
      expect(createHash('sha256').update(readFileSync(file)).digest('hex'), id).toBe(SHA[id]);
    }
  });
});
