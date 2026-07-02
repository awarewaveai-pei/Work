-- Cold Outreach seed for Soulful Expression Art Therapy
-- Run once in Supabase SQL Editor (EU instance).
-- Idempotent: ON CONFLICT DO NOTHING on org slug; UUIDs are stable via DO block.
-- After running, go to app.aware-wave.com/ops/outreach and filter by org = soulful-expression.

BEGIN;

-- ── 1. Org ──────────────────────────────────────────────────────────────────
INSERT INTO public.organizations (type, name, slug, status, default_locale, default_timezone)
VALUES (
  'client',
  'Soulful Expression Art Therapy',
  'soulful-expression',
  'active',
  'zh-TW',
  'Asia/Taipei'
)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Service Profile ───────────────────────────────────────────────────────
DO $$
DECLARE
  v_org_id uuid;
  v_sp_id  uuid;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'soulful-expression';

  -- Guard: only insert if profile doesn't exist yet for this org + service_name
  IF NOT EXISTS (
    SELECT 1 FROM public.co_service_profiles
    WHERE organization_id = v_org_id AND service_name = '藝術治療個人/小組療程'
  ) THEN
    INSERT INTO public.co_service_profiles (
      organization_id,
      industry,
      service_name,
      positioning,
      service_description,
      target_problems,
      target_audiences,
      usp,
      price_position,
      tone,
      forbidden_words,
      replacement_words,
      compliance_rules,
      sensitive_industry_type
    ) VALUES (
      v_org_id,
      '心理健康／藝術治療',
      '藝術治療個人/小組療程',
      '台灣持牌藝術治療師，接受兒童、青少年及成人，提供個人及小組療程',
      '透過繪畫、拼貼、沙盤等藝術媒材，協助當事人表達難以言語的情緒，不需藝術背景。適合壓力調適、情緒調節、人際關係困擾及創傷復原。',
      ARRAY['員工高壓/倦怠', '學生情緒困擾', '創傷復原', '家庭關係衝突', '社交焦慮'],
      ARRAY['企業HR/員工福利負責人', '學校輔導主任/社工', '醫療院所社工/心理師', '社區心理健康機構'],
      '以藝術媒材為橋樑，讓難以開口的情緒找到出口——無需藝術才能，只需一顆願意探索的心',
      '個人療程 $2,500/次；小組方案可議（企業/學校客製化報價）',
      '溫暖同理',
      ARRAY['保證療效', '百分百', '治癒', '立即見效', '包你好', '根治'],
      ARRAY['有機會緩解', '多數個案反映改善', '療程過程中'],
      '不得聲稱醫療診斷或保證治療結果；遵循台灣心理師法相關規範',
      'mental_health'
    );
  END IF;

  -- ── 3. Sample Leads ────────────────────────────────────────────────────────
  SELECT id INTO v_sp_id FROM public.co_service_profiles
  WHERE organization_id = v_org_id AND service_name = '藝術治療個人/小組療程';

  -- Lead A: 科技公司 HR
  IF NOT EXISTS (SELECT 1 FROM public.co_leads WHERE organization_id = v_org_id AND name = '遠傳電信 員工福利部') THEN
    INSERT INTO public.co_leads (
      organization_id, service_profile_id,
      name, industry, region, source_type, source_url,
      contact_role,
      observation,
      pain_guess, recommended_angle,
      status, do_not_contact, consent_status
    ) VALUES (
      v_org_id, v_sp_id,
      '遠傳電信 員工福利部',
      '電信/科技',
      '台北市',
      'manual',
      'https://www.fareastone.com.tw/corporate/esg',
      'HR 總監 / 員工福利負責人',
      '遠傳 2025 ESG 報告強調「心理健康是員工福利核心」，已提供 EAP 諮詢服務，但報告中提到員工平均壓力指數連兩年上升（p.42）。',
      '現有 EAP 以談話諮詢為主，部分高壓員工反映「說不出口的感覺」，藝術媒材可作為 EAP 的補充模組，切入點是「不用開口的情緒出口」。',
      '作為 EAP 補充的小組工作坊（半天、8-12 人）——量化指標：壓力前後測，符合 ESG 報告所需量化數據',
      'new', false, 'legitimate_interest'
    );
  END IF;

  -- Lead B: 國中輔導室
  IF NOT EXISTS (SELECT 1 FROM public.co_leads WHERE organization_id = v_org_id AND name = '台北市立中正國中 輔導室') THEN
    INSERT INTO public.co_leads (
      organization_id, service_profile_id,
      name, industry, region, source_type, source_url,
      contact_role,
      observation,
      pain_guess, recommended_angle,
      status, do_not_contact, consent_status
    ) VALUES (
      v_org_id, v_sp_id,
      '台北市立中正國中 輔導室',
      '教育',
      '台北市',
      'manual',
      'https://www.ccjh.tp.edu.tw/nss/p/counsel',
      '輔導主任',
      '學校輔導室網頁顯示目前提供個別諮商與團體輔導，但未提及藝術治療或非語言表達媒材。輔導教師人力為 3 位輔導師對 1,200 名學生（低於教育部建議比例）。',
      '青少年語言防衛機制強，傳統談話諮商啟動慢；藝術媒材可降低進入門檻，且一次小組 8 人可提升觸及率，緩解輔導師人力不足問題。',
      '合作模式：一學期 6 次小組課（班級/高風險學生）；申請教育局補助方案作為切入，費用分擔',
      'new', false, 'legitimate_interest'
    );
  END IF;

  -- Lead C: 醫院社工部
  IF NOT EXISTS (SELECT 1 FROM public.co_leads WHERE organization_id = v_org_id AND name = '台北榮民總醫院 社工室') THEN
    INSERT INTO public.co_leads (
      organization_id, service_profile_id,
      name, industry, region, source_type, source_url,
      contact_role,
      observation,
      pain_guess, recommended_angle,
      status, do_not_contact, consent_status
    ) VALUES (
      v_org_id, v_sp_id,
      '台北榮民總醫院 社工室',
      '醫療',
      '台北市',
      'manual',
      'https://www.vghtpe.gov.tw/socialwork',
      '社工室主任',
      '榮總社工室網頁列出腫瘤科、精神科、老年醫學科的個案服務，但沒有提到任何非語言表達或藝術治療的介入服務。腫瘤科病人的心理支持仍以個別談話和家屬衛教為主。',
      '腫瘤科/慢性病患者長期情緒積壓，語言難以表達不確定感和失控感；藝術治療提供外化工具，社工可以更快了解個案情緒狀態，也作為家屬支持的媒介。',
      '院內藝術治療師外包合作方案（定期駐點或接受轉介）；強調「補充既有個管師服務」而非取代',
      'new', false, 'legitimate_interest'
    );
  END IF;

  RAISE NOTICE 'Soulful Expression seed complete. org_id = %', v_org_id;
END;
$$;

COMMIT;

-- Verify:
-- SELECT o.slug, sp.service_name, count(l.id) as leads
-- FROM organizations o
-- JOIN co_service_profiles sp ON sp.organization_id = o.id
-- LEFT JOIN co_leads l ON l.organization_id = o.id
-- WHERE o.slug = 'soulful-expression'
-- GROUP BY 1, 2;
