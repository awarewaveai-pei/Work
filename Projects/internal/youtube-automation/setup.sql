-- ═══════════════════════════════════════════
-- 在 Supabase SQL Editor 執行這個檔案
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS topics (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic               text NOT NULL,
  source              text DEFAULT 'manual',
  -- manual / google_trends / reddit / youtube / news

  mode                text DEFAULT 'A',
  -- A = 全新生成文章 + 影片
  -- B = 已有文章內容，只生成影片腳本

  article_input_title text DEFAULT NULL,   -- 模式 B：已有文章標題
  article_content     text DEFAULT NULL,   -- 模式 B：已有文章內容

  priority            int  DEFAULT 5,      -- 1 = 最優先，10 = 最低

  status              text DEFAULT 'pending',
  -- pending / processing / done / skip / failed

  scheduled_at        timestamptz DEFAULT NULL,  -- 指定發佈時間，NULL = 盡快

  notes               text DEFAULT NULL,

  created_at          timestamptz DEFAULT now(),
  done_at             timestamptz DEFAULT NULL,

  -- 執行結果
  youtube_url         text DEFAULT NULL,
  wp_url              text DEFAULT NULL,
  article_title       text DEFAULT NULL,
  cost_usd            numeric DEFAULT NULL
);

-- 排序索引
CREATE INDEX IF NOT EXISTS idx_topics_queue
  ON topics (status, priority ASC, scheduled_at ASC NULLS LAST, created_at ASC);

-- 待處理 View
CREATE OR REPLACE VIEW topics_pending AS
  SELECT * FROM topics
  WHERE status = 'pending'
  ORDER BY priority ASC, scheduled_at ASC NULLS LAST, created_at ASC;
