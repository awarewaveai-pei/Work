-- ═══════════════════════════════════════════
-- setup.sql
-- 在 Supabase SQL Editor 執行這個檔案
-- ═══════════════════════════════════════════

-- 主題佇列表
CREATE TABLE topics (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic                text NOT NULL,
  source               text DEFAULT 'manual',
  mode                 text DEFAULT 'A',
  article_input_title  text DEFAULT NULL,
  article_content      text DEFAULT NULL,
  priority             int  DEFAULT 5,
  status               text DEFAULT 'pending',
  scheduled_at         timestamptz DEFAULT NULL,
  notes                text DEFAULT NULL,
  created_at           timestamptz DEFAULT now(),
  done_at              timestamptz DEFAULT NULL,
  youtube_url          text DEFAULT NULL,
  wp_url               text DEFAULT NULL,
  article_title        text DEFAULT NULL,
  cost_usd             numeric DEFAULT NULL
);

CREATE INDEX idx_topics_queue
  ON topics (status, priority ASC, scheduled_at ASC NULLS LAST, created_at ASC);

-- 發佈記錄表
CREATE TABLE publish_log (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id     uuid REFERENCES topics(id),
  platform     text NOT NULL,
  status       text DEFAULT 'pending',
  url          text DEFAULT NULL,
  error        text DEFAULT NULL,
  published_at timestamptz DEFAULT now()
);

-- 成本追蹤表
CREATE TABLE cost_log (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id   uuid REFERENCES topics(id),
  service    text NOT NULL,
  amount_usd numeric NOT NULL,
  detail     text DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

-- A/B 測試表
CREATE TABLE ab_tests (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id     uuid REFERENCES topics(id),
  title_a      text NOT NULL,
  title_b      text NOT NULL,
  clicks_a     int DEFAULT 0,
  clicks_b     int DEFAULT 0,
  winner       text DEFAULT NULL,
  created_at   timestamptz DEFAULT now()
);

-- 待處理 View
CREATE VIEW topics_pending AS
  SELECT * FROM topics
  WHERE status = 'pending'
  ORDER BY priority ASC, scheduled_at ASC NULLS LAST, created_at ASC;

-- 成本摘要 View
CREATE VIEW cost_summary AS
  SELECT
    DATE(created_at) as date,
    service,
    SUM(amount_usd) as total_usd,
    COUNT(*) as count
  FROM cost_log
  GROUP BY DATE(created_at), service
  ORDER BY date DESC;
