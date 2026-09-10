let catalog, baseline, token, industry; const answers={}; const customs=[]; let selectedOnly=false;
let industryList=[]; let defaultIndustry;
const $=id=>document.getElementById(id);
function cond(c){if(!c)return true;if(c.question)return answers[c.question]===c.equals;if(c.all)return c.all.every(cond);if(c.any)return c.any.some(cond);return false}
function active(q){return cond(q.active_when)}
// Every active question defaults to false (不要) until its card is clicked to select it (要).
// This produces byte-identical payload data to the old two-button UI (a boolean per active
// question either way) -- it only removes the extra click needed to explicitly say "不要" for
// the common case of "not this one", per operator UX feedback (2026-09-05).
// Categories may optionally declare cat.groups=[{id,title},...] to visually cluster their
// questions under sub-headers (e.g. commercial's "enterprise/subscription/general" scenarios --
// see questionnaires/catalog.json, not a fixed category number since 09 renumbers over time).
// A question opts in via q.group=<group id>; that id must be one its own category declared
// (validate_configurator.py enforces this -- a dangling/misspelled q.group is a hard error, not
// a silent no-op). Ungrouped questions (no q.group, or categories with no groups at all) always
// render first in bucket 0 with no header -- this is the deliberate place for a category's lead/
// gate question (e.g. Q-COM-001 "向客戶收費"), not an accidental side effect of array order. A
// category with groups but no ungrouped question just has an empty, invisible bucket 0.
// Categories with no groups at all render exactly as before -- a strict superset of the old
// single-flat-grid behavior, byte-identical rendering for every category that doesn't use it.
function render(){const host=$('questions');host.innerHTML='';for(const cat of catalog.categories){const qs=catalog.questions.filter(q=>q.category===cat.id);const activeQs=qs.filter(active);for(const q of qs)if(!active(q))delete answers[q.id];else if(!(q.id in answers))answers[q.id]=false;const visible=selectedOnly?activeQs.filter(q=>answers[q.id]===true):qs;if(!visible.length)continue;const selCount=activeQs.filter(q=>answers[q.id]===true).length;const wrap=document.createElement('div');wrap.className='category';wrap.innerHTML=`<h2>${String(cat.order).padStart(2,'0')}. ${cat.title} <span class="cat-count">${selCount?`已選 ${selCount}`:''}</span></h2><p>${cat.description}</p>`;
const groups=cat.groups||[];const groupIdx=id=>{const i=groups.findIndex(g=>g.id===id);return i===-1?0:i+1};
const buckets=[];for(let i=0;i<=groups.length;i++)buckets.push([]);
for(const q of visible)buckets[q.group?groupIdx(q.group):0].push(q);
const card=q=>{const a=active(q);const sel=a&&answers[q.id]===true;const el=document.createElement('div');el.className='card'+(sel?' selected':'')+(a?'':' inactive');el.innerHTML=`<div class="card-check">${sel?'✓':''}</div><div class="card-title">${q.label}</div>${q.description?`<div class="card-desc">${q.description}</div>`:''}${!a?'<div class="disabled-note">由前置答案自動停用</div>':''}`;if(a)el.onclick=()=>{answers[q.id]=!answers[q.id];render()};return el};
buckets.forEach((list,i)=>{if(!list.length)return;if(i>0){const h=document.createElement('h3');h.className='group-title';h.textContent=groups[i-1].title;wrap.appendChild(h)}const grid=document.createElement('div');grid.className='card-grid';for(const q of list)grid.appendChild(card(q));wrap.appendChild(grid)});
host.appendChild(wrap)}
 const allActive=catalog.questions.filter(active);const totalSel=allActive.filter(q=>answers[q.id]===true).length;$('progress').textContent=`已選擇 ${totalSel} 項功能（共 ${allActive.length} 項目前可選）`;}
function addCustom(category='',statement=''){const idx=customs.length;customs.push({category,statement});renderCustom()}
function renderCustom(){const h=$('customList');h.innerHTML='';customs.forEach((x,i)=>{const row=document.createElement('div');row.className='custom-row';const opts=catalog.categories.map(c=>`<option value="${c.id}" ${x.category===c.id?'selected':''}>${c.title}</option>`).join('');row.innerHTML=`<select>${opts}</select><input placeholder="輸入你的特殊需求" value="${x.statement.replaceAll('&','&amp;').replaceAll('"','&quot;')}"><button>刪除</button>`;const [s,inp,del]=row.children;s.onchange=()=>customs[i].category=s.value;inp.oninput=()=>customs[i].statement=inp.value;del.onclick=()=>{customs.splice(i,1);renderCustom()};h.appendChild(row)})}
function payload(){return {project:{name:$('projectName').value.trim()},answers,custom_requirements:customs.filter(x=>x.statement.trim()),industry}}
async function post(path){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Foundry-Token':token},body:JSON.stringify(payload())});const d=await r.json();if(!r.ok)throw new Error((d.errors||[d.error||'request failed']).join('\n'));return d}
async function preview(){try{$('status').textContent='驗證中…';const d=await post('/api/resolve');$('status').textContent='驗證通過';$('result').innerHTML=`<h2>Foundry 自動解析</h2><p>使用者選擇 ${d.plan.user_selected.length}，自動衍生 ${d.plan.derived.length}，Baseline ${d.plan.foundation.length}，Deferred ${d.plan.deferred.length}</p><pre>${JSON.stringify(d.plan,null,2)}</pre>`}catch(e){$('status').textContent='驗證失敗';$('result').innerHTML=`<h2>需要修正</h2><pre>${e.message}</pre>`}}
async function generate(){try{$('status').textContent='生成中…';const d=await post('/api/generate');$('status').textContent='生成完成';$('result').innerHTML=`<h2>生成完成</h2><p>${d.path}</p><p>Modules ${d.coverage.modules_selected}；Blueprint ACTIVE ${d.coverage.blueprints_active}/${d.coverage.blueprints_total}；Current capabilities ${d.coverage.current_capabilities}</p><pre>${JSON.stringify(d.plan,null,2)}</pre>`}catch(e){$('status').textContent='生成失敗';$('result').innerHTML=`<h2>生成失敗</h2><pre>${e.message}</pre>`}}
// Industry-pack selection layer (2026-09-10). The picker is the first thing shown; nothing
// under #questionnaireArea renders (and no /api/catalog|resolve|generate call fires) until an
// industry is chosen. Switching industries wipes `answers`/`customs`/project name so a previous
// industry's selections never leak into the next one's payload.
function resetQuestionnaireState(){for(const k in answers)delete answers[k];customs.length=0;selectedOnly=false}
function renderIndustryPicker(){const host=$('industryPicker');host.innerHTML='';for(const it of industryList){const el=document.createElement('div');el.className='card industry-card';el.innerHTML=`<div class="card-title">${it.name}</div><div class="card-desc">${it.id}${it.id===defaultIndustry?'（預設）':''}</div>`;el.onclick=()=>loadIndustry(it.id);host.appendChild(el)}}
function showIndustryPicker(){$('questionnaireArea').hidden=true;$('industrySection').hidden=false}
async function loadIndustry(id){const r=await fetch(`/api/catalog?industry=${encodeURIComponent(id)}`);const d=await r.json();if(!r.ok){alert((d.error)||'載入產業題庫失敗');return}
industry=id;catalog=d.catalog;baseline=d.baseline;token=d.token;resetQuestionnaireState();
const meta=industryList.find(x=>x.id===id);$('activeIndustryName').textContent=meta?meta.name:id;
$('projectName').value='';$('status').textContent='';$('result').innerHTML='';
$('baseline').innerHTML=baseline.capabilities.map(x=>`<span class="chip">🔒 ${x.name}</span>`).join('');
$('showAll').classList.add('active');$('onlySelected').classList.remove('active');
$('industrySection').hidden=true;$('questionnaireArea').hidden=false;
render();renderCustom()}
(async()=>{const r=await fetch('/api/industries');const d=await r.json();industryList=d.industries;defaultIndustry=d.default_industry;token=d.token;
renderIndustryPicker();
$('addCustom').onclick=()=>addCustom('custom','');$('validateBtn').onclick=preview;$('generateBtn').onclick=generate;$('switchIndustry').onclick=showIndustryPicker;$('showAll').onclick=()=>{selectedOnly=false;$('showAll').classList.add('active');$('onlySelected').classList.remove('active');render()};$('onlySelected').onclick=()=>{selectedOnly=true;$('onlySelected').classList.add('active');$('showAll').classList.remove('active');render()}})()