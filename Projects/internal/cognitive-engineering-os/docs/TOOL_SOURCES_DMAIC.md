# DMAIC 來源閱讀筆記（操作者 2026-10-14 給的 12 個網址；T5：整篇含圖；未讀處註明）

## S1 ASQ DMAIC https://asq.org/quality-resources/dmaic  (read in full via browser; 4 figures viewed)
- DMAIC = structured problem solving to improve an EXISTING process not meeting standards/customer expectations; each phase builds on previous; long-term solutions. Used in CI, lean, Six Sigma, or standalone.
- Define: problem + project goals; customers (internal/external) + requirements; PROJECT CHARTER (focus, scope, direction, motivation; problem statement + goal statement, metrics, broad timeline); STAKEHOLDER ANALYSIS; team chosen. Tool: VOC (satisfy / delight / dissatisfy).
- Measure: true process identified+documented; process steps + inputs/outputs; measurement systems identified/developed, validated (MSA); BASELINE performance with trustworthy data. Tools: process map, capability analysis, Pareto chart.
- Analyze: critical inputs (performance drivers) -> root causes of variation/defects. Tools: root cause analysis, FMEA, multi-vari charts.
- Improve: potential solutions identified+evaluated, process optimized; critical inputs to control; process capability + project financials estimated. Tools: DOE, kaizen event.
- Control: mistake-proofing, long-term measurement, REACTION PLANS; SOPs; process capability. Tools: control plan, SPC, 5S, poka-yoke.
- When: most projects, esp. complex/high risk. Two modes: team project (months, part-time) vs kaizen event (~1 week, prep on D+M by expert; pilot during event, full rollout after; monitor).
- DMAIC vs DMADV: DMAIC = incremental improvement of existing process; DMADV (define, measure, analyze, design, verify) = new product/service or full overhaul.
- Fig 1: cycle D->M->A->I->C->D. Fig 2 "Modular kaizen flow using DMAIC": main DMAIC loop; disruption (1) at Measure spawns a modular-kaizen loop M->A->I (2,3) feeding back (4) to main Measure; decision "Accept / Adjust / Abandon". Fig 3: DMADV table objectives+tools (Define: charter, project&team mgmt, strategic planning; Measure: VOC, QFD, design scorecard; Analyze: function identification, concept alternatives, creativity, concept selection, design FMEA; Design: interface diagrams, transfer function, parameter design, tolerance design, robust design, DFX, prototyping, scorecard; Verify: piloting, control plan, reliability, project closure). Featured fig: Lean Six Sigma DMAIC roadmap 5 chevrons.
- Refs cited by page: McShane-Vaughn, ASQ Certified Six Sigma Black Belt Handbook 4th ed (Quality Press 2022); Berardinelli QP Nov 2012; Duffy LSSR May 2019.

## S2 ASQ Six Sigma https://asq.org/quality-resources/six-sigma (all 4 tabs read via textContent; 3 figures viewed)
- Goal: customer satisfaction by reducing/eliminating process variation -> defects/errors. 6-sigma = 3.4 DPMO. All work = processes (inputs -> outputs); control inputs -> control outputs (Y = f(X) idea).
- Definitions: fact/data-driven, prevention over detection; statistical + scientific method; common threads: teams on well-defined bottom-line projects, statistical thinking training, DMAIC, management support.
- Tools named: SPC, control charts, FMEA, process mapping.
- Lean vs Six Sigma: lean = waste, flow, standard work (kaizen, workplace org, visual controls, value stream map); 6S = variation (stats, DOE, SPC). Start lean, then 6S tools if problems remain.
- Roles: Champion (exec, resources, barriers, project selection), Black Belt (full-time leader), Green Belt (part-time members), Master Black Belt (mentor/trainer).
- Improvement process 6 steps: define products&services; identify customer requirements (measurable); compare product with requirements (gaps, prioritize); describe the process (flowcharts); improve the process (simplify, mistake-proof, eliminate/combine steps); measure quality&productivity (baseline, track, benchmark).
- Fig "Components of a Six Sigma quality program": improvement process (6 steps above); quality initiatives (participative mgmt, short-cycle mfg, design for manufacture, benchmarking, SPC, supplier qualification); quality measure (process mean mu + std dev sigma; capability index Cp, Cpk; defects per unit dpu); improvement tools (QFD, flowcharts, Pareto, histograms, cause&effect diagrams, experimental design).
- Fig "Six Sigma Process Capability": sigma level / DPMO / cost of poor quality: 6=3.4 (<10% sales, world-class); 5=230 (10-15%); 4=6,200 (15-20%, industry avg); 3=67,000 (20-30%); 2=310,000 (30-40%, noncompetitive); 1=700,000.
- Fig "Six Sigma Process": 5 rounded cards D/M/A/I/C with icons, no text.
- History ref: "Six Sigma: A Breakthrough Strategy for Profitability", Quality Progress May 1998 pp. 60-64.

## S3 ASQ Six Sigma tools https://asq.org/quality-resources/sixsigma/tools (read in full; no content figures)
- "the tools themselves are not unique, the way they are applied and integrated as part of a system is" -> supports: tools standalone, DMAIC = the integrating system.
- Listed: DMAIC; 5S; seven wastes (overproduction, waiting, transport, over-processing, inventory, motion, defects); value stream mapping (current-state then future-state map; future state most important); flow; visual workplace; VOC (-> VOC table VOCT; sources: sales/tech trip reports, warranty claims, support forums/help lines, social media); project mgmt (Gantt), team engagement (brainstorming, nominal group technique).
- Case: nursing shift-change DMAIC, VSM found report 43 min avg; sigma level 0.7 -> 3.3.

## S4 GoLeanSixSigma DMAIC https://goleansixsigma.com/dmaic-five-basic-phases-of-lean-six-sigma/ (read in full; 8 content figures viewed incl. DMAIC In-Depth infographic top-to-bottom)
- DMAIC = 5 phases, for real processes "when the root cause isn't obvious"; built on the Scientific Method.
- BEFORE DMAIC, select a good project (4 rules): obvious problem in an existing process; meaningful but manageable; potential to cut lead time or defects -> savings/productivity; data can be collected (measurable improvement). Fig Project Selection: greatest impact + most manageable effort + aligned with strategy (scale "reduce cycle time" vs "reduce rework").
- Define ("What problem would you like to fix?"): Project Charter; high-level process map; customer needs; Process Walks + talk to participants; align with leadership. Tools (infographic): Project Charter, VOC, SIPOC.
- Fig Project Charter (living document; presenting problem, target, boundaries): PROBLEM STATEMENT ("the problem captured in the form of a measurement"), BUSINESS CASE (business reasons for doing it), GOAL STATEMENT (target of the process measurement), TIMELINE (when each phase completes), SCOPE (in / out), TEAM MEMBERS.
- Measure ("How does this process currently perform? magnitude?"): focus lead time or quality; define measures; baseline. Tools: As-Is Map, Process Walk, 8 Wastes, Data Collection, Data Entry, Baseline. Fig Process Map: linear process vs decision-based (diamond yes/no loop).
- Analyze ("What is causing the problem?"): resist jumping to solutions; brainstorm potential root causes (not solutions), develop hypotheses, prove/disprove them; "verify hypotheses before implementing solutions". Tools: Clues, Fishbone Diagram, 5 Whys, Confirm. Fig 5 Whys: SYMPTOM customers are mad -> service slow -> orders late -> chef not cooking -> washing dishes -> ran out of plates = ROOT CAUSE.
- Improve ("How will the team fix the root causes?"): refine countermeasure ideas, PILOT process changes, implement, collect data to confirm measurable improvement; verification = process analysis + data analysis, before full implementation. Tools: 5S, Solutions, Implement, To-Be Map, Verification. Fig 5S: Sort, Set in order, Shine, Standardize, Sustain.
- Control ("How do you sustain the improvement?"): MONITORING PLAN + RESPONSE PLAN (if performance dips); hand off to PROCESS OWNER. Tools: Visual Management, Monitoring & Response, Transfer Opportunities, Project Handoff, Project Summary. Fig Monitoring & Response: line over time with a TRIGGER LEVEL; below it -> response checklist.

## S5 BTOES Insights https://insights.btoes.com/understanding-the-definition-of-six-sigma (read in full, Dec 7 2023; figures = logos/ads only, no content figure)
- Six Sigma: data-driven, reduce defects + variation; Motorola 1980s; 6 std devs from mean -> 3.4 per million.
- 4 principles: customer requirements; data-driven decisions; DMAIC; management involvement/commitment.
- Benefits: quality/customer satisfaction, efficiency/cost (waste, rework, cycle time), decisions, employee engagement, competitive advantage.
- Examples GE, Motorola, Toyota -- marketing blog, no citations; "Toyota implemented Six Sigma" is not supported by the stronger sources (Toyota = TPS/lean) -> do NOT use as a lesson fact.
- Books named: Harry & Schroeder "Six Sigma: The Breakthrough Management Strategy..."; Pyzdek & Keller "The Six Sigma Handbook".
- Weakest source of the set; use only for the definition line.

## S6 The Lean Six Sigma Company https://www.theleansixsigmacompany.com/us/library/what-is-six-sigma/ (read in full, Tom Lindsen 18 Jun 2025; only figure = brochure cover, no content)
- Six Sigma = repository of proven quality principles/techniques, elaborating Deming's quality circle (PDCA) -> 5 phases D/M/A/I/C (British "Analyse").
- sigma = std dev; goal defect-free; 6 sigma = 3.4 per million (e.g. 1M invoices -> 3 credit invoices). Traditional orgs accept 2-3 sigma = 67,000-308,000 DPMO.
- VOC (customer requirements) = STARTING POINT of a Six Sigma project.
- Manufacturing origin; service processes are measurable too.
- Roles: sponsor, project lead, admin support; Yellow/Green/Black Belts. Quote "Being better is cheaper" - Mikel Harry.

## S7 Lean Six Sigma Groep (NL) https://leansixsigmagroep.nl/en/lean-agile-and-six-sigma/what-is-six-sigma/ (read in full; no content figures)
- Principles: starts and ends with the customer; every task is a process; process oriented ("limit island culture"); variation is the enemy; "show me the data"; financial results as starting point.
- Phases: D = problem + value for the company, customer wishes visualized; M = measure the process, collect baseline info, set improvement goals; A = main causes = process factors with most influence on output; I = best options, TEST the solutions; C = best solution implemented, project + new methods secured and TRANSFERRED.
- History: Bill Smith at Motorola 1980 (sic; commonly cited 1986); Jack Welch made it central at GE 1995.
- Roles: Champions pick projects; MBB 100% coach; BB 100% project execution; GB part-time; Orange/White belts.
- Lean vs Six Sigma table: speed/waiting/value-adding/flow/efficiency/time(sec) vs defects/variation/statistics/results/effectiveness/"pieces".

## S8 JMP 台灣 (zh-TW) 提升產品品質：深入解析六標準差DMAIC方法... https://community.jmp.com/t5/JMPer-Cable-Blog/.../ba-p/766658 (text read in full; 27 figures -- viewing pending)
- Worked case (touch screen bonded to front bezel; spec: screen 0.15-0.25 mm below bezel; 47% out of spec, 27% too small). Story format: Mr. Q (QA lead), 小胖 (new grad), 小M (mechanical engineer).
- Define: project charter written in JMP Journal (project name, description, current problem, expected goal) [fig1]; graph builder colouring points below LSL, defect images as point labels [fig2]; Process Screening -> out-of-spec rate + Cpk; process not stable [fig3].
- Measure: BEFORE collecting data, confirm the measurement is valid: MSA. Attribute data (go/no-go) -> Attribute Gauge Chart Kappa; continuous -> Variability Gauge Chart Gauge R&R. Rule: %GR&R >30% bad, 10-30% acceptable but improve, <10% good (case 7.96%) [fig4]; variance components: most variation from parts, not operators/gauges. Then collect data incl. candidate factors (needs domain expert).
- Analyze: FMEA lists too many candidate causes -> brainstorm a FISHBONE with the expert to narrow to important factors [fig5] (pressing fixture stability etc.); collect data (most time-consuming step: data collection + cleaning); Response Screening / Fit Y by X correlation of each factor vs result [fig6,7] -> 3 key factors: press time, press pressure, adhesive type.
- Improve: check effects incl. quadratic + interactions (R^2 0.39 -> 0.47 with quadratic) [fig8,9]; custom DOE sized to affordable run count [fig10]; run experiment, regression, R^2adj ~0.98 [fig11-13]; Profiler maximize desirability with target 0.2 -> type1: time 11.9, pressure 8.4 [fig14]; per adhesive type settings [fig15,16]; choose type2 (narrowest CI) subject to supplier capacity.
- Control: control chart after improvement shows less variation [fig17]; before/after test: normality (Shapiro-Wilk p<0.0001 -> not normal), unequal variances [fig18] -> nonparametric Wilcoxon/Kruskal-Wallis p<0.0001 -> means differ [fig19]; document the solution and share; outcomes: less rework, more output, less scrap.
- Lesson value: a full Chinese worked DMAIC story with numbers; Measure = MSA first; Analyze = FMEA -> fishbone -> data screening; Improve = DOE; Control = control chart + before/after significance test.
- FIGURES (all 27 viewed, rendered to scratchpad/jmp/fig-00..26.png):
  - fig00 infographic 六標準差(DMAIC)分析方法: 定義=清楚說明業務問題、目標、潛在資源、專案大小、高階專案時程；列出已知事項、澄清事實、設定目標。測量=客觀搜集現有資訊作改進基礎，建立流程績效基線；確認量測系統準確度，好資料是核心。分析=識別、驗證並選擇要消除的根本原因；腦力激盪或根因分析(魚骨圖)找大量可能原因，統計分析手法+討論確認因子與結果相關性；重複直到識別「有效」因子。改善=找出對策及適當因子設定值以達最佳期望結果並測試實施；可用實驗設計。控制=用統計工具監控改善結果、維持效能；例：管制圖、製程統計量觀測。
  - fig01 專案章程 (JMP Journal) fields: Project Name; Date; Team Members (Project Manager / Project Sponsor / Project Advisor / Project members); Project Description; Business Case (spec 0.2+/-0.05 mm, consequences, current out-of-spec 47%, target 1%, saves >=45 cost units + rework time, efficiency +87%); Expected Goals/Deliverables.
  - fig02 問題描述: dot+box plot of step data vs USL/LSL, out-of-spec points red; hover shows defect photo.
  - fig03 Process screening: Mean 0.18908, n 100, Ppk 0.200, Cpk 0.201, out-of-spec 47 (47%); Individual chart with limits.
  - fig04 Gauge R&R table: repeatability EV, reproducibility AV (operator, operator*part), RR, PV, TV; %GR&R 7.96; P/T-like ratio 0.0799; number of distinct categories 17; variance components part-to-part 99.37%.
  - fig05 fishbone as Parent/Child table: effect 觸控螢幕和前框黏合不佳 -> 人(作業員, 班別) 機(生產線別, 壓合機器型號) 料(前框型號, 觸控螢幕類型, 壓力膠型號) 法(黏合壓合時間, 黏合壓合壓力, 下壓距離, 壓力膠膜揭除至壓合的時間) 環(室溫, 濕度). NOTE: 5M1E style with 5 bones (no 測).
  - fig06 drawn fishbone of the same table (head at right).
  - fig07 Response screening table: X, count, p-value, logworth, FDR p, FDR logworth, effect size, R^2 -> 壓合壓力, 壓合時間, 壓力膠型號 significant; rest not.
  - fig08 bivariate fits + oneway ANOVA by adhesive type. fig09 linear vs quadratic fit (R^2 0.393 -> 0.466).
  - fig10 effect summary (R^2 0.945). fig11 interaction profiles.
  - fig12 custom DOE factors: time continuous 10-16, pressure continuous 8-10, adhesive categorical 1/2/3; model terms incl. quadratics + interactions. fig13 18-run design table.
  - fig14 actual-by-predicted RSq 0.988; fig15 parameter estimates; fig16 summary of fit (RSq adj 0.977, n 18).
  - fig17-19 profiler menu + desirability: target 0.20, CI [0.17,0.23]; fig20 type2 CI [0.18,0.22]; fig21 remembered settings per type (Type1 11.89/8.41, Type2 11.19/9.09, Type3 12.07/8.64; all step 0.2).
  - fig22 I-MR control chart phased 改善前/改善後 with limits summary (before UCL 0.547 LCL -0.134; after 0.188-0.204).
  - fig23 distributions before/after, Shapiro-Wilk + Anderson-Darling. fig24 equal-variance tests (O'Brien, Brown-Forsythe, Levene, Bartlett, F) all p<.0001; Welch. fig25 nonparametric menu; fig26 Wilcoxon/Kruskal-Wallis ChiSq 19.74 p<.0001.

## S9/S10 ISO 13053-1:2011 https://www.iso.org/standard/52901.html  and  ISO 13053-2:2011 https://www.iso.org/standard/52902.html (catalogue pages read in full via headless browser; full text paywalled CHF 159 / 181 -- NOT read)
- 13053-1 "Quantitative methods in process improvement -- Six Sigma -- Part 1: DMAIC methodology", Ed.1 2011-09, 32 pp, ISO/TC 69/SC 7, ICS 03.120.30, confirmed 2022 (current). Abstract: describes Six Sigma methodology, typically 5 phases DMAIC; recommends best practice for each phase; how Six Sigma projects should be managed; roles, expertise and training of personnel; applies to manufacturing AND service/transactional processes.
- 13053-2 "Part 2: Tools and techniques", Ed.1 2011-09, 49 pp, same TC; tools and techniques "illustrated by factsheets" to be used at each DMAIC phase; generic, any sector/size.
- Note: operator's 2nd ISO link text shows 529 but href = 52902 (Part 2).
- No content figures (logo only).

# BENCHMARK = live iceberg, 3 pages + its result (read 2026-10-14 after operator logged in)
- P1 tool page /methods/systems.iceberg_model: breadcrumb (工具 › goal group › name); zh + en name; card 它幫你做什麼 (怎麼讀/你要做的 line; one-paragraph what+when); 開始 →; 第一次用？先上 5 分鐘的課 ↗; 做完常接 (next tools); 用到它的工作流 (or "可以單獨用"); 同一類常用 (siblings + count link).
- P2 run page /methods/<id>/run: breadcrumb; title; 怎麼用？課 link; tool zh/en + family; status (還沒執行; cost estimate ~24k tokens ≈ NT$3); 怎麼讀; 你的案例 form: per field label-question + hint + placeholder example; 貼上描述先免費比對再 AI 起草; 存到 (project/analysis picker); buttons 執行分析 / 用示範案例填入 / 清空; 結果 placeholder; cost confirm before run.
- P3 lesson /learn/<id>: title "<name>：開始前 5 分鐘"; status 工具齊備 M1–M10 / 課程來源 n 筆 / 約 5 分鐘; 學完你會; start card (開始填我的案例 / 用示範案例試一次 #demo / 這工具適合我的問題嗎 /#ask); 手邊有這些會填得比較快 list; domain chips x5 (藝術反思/EdD 預設, 合作對象, 一個決策, 電商後台, 日常); tabs: 認識 1.5分 (what, when/when-not, picture of the method with per-layer question + intervention verb, 能回答/不能回答, per-layer example in chosen domain, 記法) / 看例子 1分 (worked table: layer, content, what acting only here does; 看一個完整分析頁) / 怎麼填 1.5分 (per field good vs bad example with what bad lacks; 留白 = 證據缺口; 常見錯誤 4 ✕; 自我檢查 3 Q with answers) / 看懂結果 1分 (3-step reading; header + nine sections each one paragraph) / 教材版 (45-min class plan table, talking points per step, 3 discussion Qs, top-3 student mistakes + how to respond, handout/slides outline) / 來源 ([n] list + 知識不足 rule).
- Result page (/projects/<p>/analyses/<INTERP>): h1 = AI headline; meta (approved, data counts, completeness n/n, cost); the form again (edit + rerun); ① 結論 (一句話, 3 findings each with confidence+reason+[n], 建議, 證據缺口, 改判條件, 你的判斷 同意/部分/不同意); ② tool picture with per-unit question + user content + intervention, ★ focus, 資料厚度 per unit; ③ 圖表分析 3 charts each 怎麼看/看到/來源; ④ one card per unit (這層問/你填的/這代表/在這層出手+槓桿/對應方案/資料厚度); ⑤ 總結 (主要發現, 建議順序, 證據缺口); ⑥ 對照表; ⑦ 解決方案 A 3 options table (做什麼/見效/成本/持久度/風險/建議) + 明天就做 / B 12-week plan table (時間/方案/行動/負責人/期限/證明/目標) + 需要誰點頭 / C one metric now->target (you confirm) + scheduled rerun; ⑧ 下一步 journey row + 3 next-tool cards (回答什麼/帶入什麼/會得到/cost) ; ⑨ 引註 + 核准/退回/匯出/刪除 + 專家模式 gates + JSON.
