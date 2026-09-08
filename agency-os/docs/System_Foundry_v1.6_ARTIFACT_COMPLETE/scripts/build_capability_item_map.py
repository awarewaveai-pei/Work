#!/usr/bin/env python3
"""Hand-curated semantic mapping of itemized blueprint content
(generation/blueprint-architecture-items.json) to capability IDs, written to
generation/blueprint-capability-item-map.json.

Not mechanical -- this is the real judgment step (System Foundry v1.6 task: "unit-level"
capability selection). Each ASSIGNMENTS[doc_id][section] is a list of capability IDs (or the
special '_module_common' bucket for items that apply to the whole module regardless of which
of its capabilities are selected -- generic LEGO-test criteria, module-wide invariants, or a
Definition of Done describing a golden flow spanning multiple capabilities) with EXACTLY one
entry per item in blueprint-architecture-items.json, same order. Built doc-by-doc by reading
the actual extracted content against capabilities/catalog.json's name/description for that
module -- not a string match (rejected in the prior module-level-only pass as not literally
matchable; see generation/blueprint-doc-mapping.json's own commit history).

Coverage is intentionally partial (see build_coverage()): modules not listed in
COVERED_MODULES keep today's full-module BLUEPRINT_ARCHITECTURE.md behavior via
foundry_generate.py's fallback -- this script only ever adds a filter, never removes the
fallback path.
"""
from __future__ import annotations
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

# doc_id -> module_id, for the modules this pass mapped (all single-doc, doc used by exactly
# this one module in generation/blueprint-doc-mapping.json -- avoids the multi-module shared-doc
# case, e.g. Loyalty_Reviews_UGC.md used by domain+loyalty+reviews, which is left on fallback).
COVERED_MODULES = {
    'cross_border': '23_Cross_Border_Compliance',
    'b2b': '18_B2B_Wholesale',
    'customer_service': '04_Customer_Service',
    'marketing': '06_Marketing_Growth',
    'subscription_commerce': '43_Subscription_Commerce',
    'pos': '19_POS_Retail',
    'oms': '12_OMS_Order_Orchestration',
    'sales': '05_CRM_Sales',
}

MC = '_module_common'

# Per doc, per section: list of capability IDs, one per item in blueprint-architecture-items.json
# (same index order). LEGO Test criteria and Definition of Done are always _module_common: they
# are module-wide invariants / golden flows that are not attributable to one specific capability
# without a false-precision guess.
ASSIGNMENTS = {
    '23_Cross_Border_Compliance': {
        'domain_objects': ['CAP-CROSS-BORDER', 'CAP-PRODUCT-PASSPORT', 'CAP-PRODUCT-PASSPORT', 'CAP-PRODUCT-PASSPORT', 'CAP-CROSS-BORDER'],
        'service_contract': ['CAP-HS-CODE', 'CAP-PRODUCT-PASSPORT', 'CAP-CROSS-BORDER', 'CAP-CROSS-BORDER', 'CAP-PRODUCT-PASSPORT'],
        'events_published': ['CAP-PRODUCT-PASSPORT', 'CAP-PRODUCT-PASSPORT', 'CAP-PRODUCT-PASSPORT', 'CAP-CROSS-BORDER'],
        'events_consumed': [MC, 'CAP-PRODUCT-PASSPORT', 'CAP-CROSS-BORDER'],
        'permissions': [MC, MC, 'CAP-PRODUCT-PASSPORT', 'CAP-CROSS-BORDER'],
        'data_rules': ['CAP-HS-CODE', MC, 'CAP-PRODUCT-PASSPORT'],
        'lego_test': [MC] * 8,
        'definition_of_done': [MC],
    },
    '18_B2B_Wholesale': {
        'domain_objects': ['CAP-B2B', 'CAP-B2B-PRICING', 'CAP-RFQ', 'CAP-B2B-BUYER-ROLES', 'CAP-CREDIT-TERMS'],
        'service_contract': ['CAP-B2B', 'CAP-B2B-BUYER-ROLES', 'CAP-B2B-PRICING', 'CAP-RFQ', 'CAP-RFQ', 'CAP-CREDIT-TERMS'],
        'events_published': ['CAP-B2B', 'CAP-RFQ', 'CAP-RFQ', 'CAP-CREDIT-TERMS'],
        'events_consumed': ['CAP-B2B', 'CAP-CREDIT-TERMS', 'CAP-CREDIT-TERMS'],
        'permissions': [MC, 'CAP-B2B', 'CAP-RFQ', 'CAP-CREDIT-TERMS'],
        'data_rules': ['CAP-B2B', 'CAP-CREDIT-TERMS', 'CAP-B2B-PRICING'],
        'lego_test': [MC] * 8,
        'definition_of_done': [MC],
    },
    '04_Customer_Service': {
        'domain_objects': ['CAP-LIVE-CHAT', 'CAP-LIVE-CHAT', 'CAP-TICKETING', 'CAP-TICKETING', 'CAP-TICKETING'],
        'service_contract': ['CAP-LIVE-CHAT', 'CAP-LIVE-CHAT', 'CAP-LIVE-CHAT', 'CAP-TICKETING', 'CAP-LIVE-CHAT', 'CAP-TICKETING', MC],
        'events_published': ['CAP-LIVE-CHAT', 'CAP-TICKETING', 'CAP-LIVE-CHAT', 'CAP-LIVE-CHAT', 'CAP-LIVE-CHAT', 'CAP-TICKETING', 'CAP-TICKETING'],
        'events_consumed': [MC, MC, MC, MC, 'CAP-OMNICHANNEL-MESSAGING'],
        'permissions': ['CAP-OMNICHANNEL-MESSAGING', 'CAP-LIVE-CHAT', 'CAP-LIVE-CHAT', 'CAP-TICKETING', 'CAP-LIVE-CHAT', 'CAP-TICKETING', 'CAP-TICKETING', MC, MC, MC],
        'data_rules': ['CAP-LIVE-CHAT', 'CAP-OMNICHANNEL-MESSAGING', 'CAP-OMNICHANNEL-MESSAGING', 'CAP-LIVE-CHAT', MC],
        'lego_test': [MC] * 8,
        'definition_of_done': [MC],
    },
    '06_Marketing_Growth': {
        'domain_objects': ['CAP-SEGMENTATION', 'CAP-CAMPAIGNS', 'CAP-MARKETING-AUTOMATION', 'CAP-MARKETING-AUTOMATION', 'CAP-SEGMENTATION', 'CAP-CAMPAIGN-ATTRIBUTION'],
        'service_contract': ['CAP-SEGMENTATION', 'CAP-CAMPAIGNS', 'CAP-CAMPAIGNS', 'CAP-MARKETING-AUTOMATION', 'CAP-CAMPAIGN-ATTRIBUTION', 'CAP-CAMPAIGN-ATTRIBUTION'],
        'events_published': ['CAP-SEGMENTATION', 'CAP-SEGMENTATION', 'CAP-CAMPAIGNS', 'CAP-CAMPAIGNS', 'CAP-CAMPAIGNS', 'CAP-MARKETING-AUTOMATION', 'CAP-MARKETING-AUTOMATION'],
        'events_consumed': [MC, MC, MC, 'CAP-MARKETING-AUTOMATION', MC, MC],
        'permissions': [MC, 'CAP-SEGMENTATION', 'CAP-CAMPAIGNS', 'CAP-CAMPAIGNS', 'CAP-MARKETING-AUTOMATION', 'CAP-SEGMENTATION'],
        'data_rules': [MC, 'CAP-SEGMENTATION', MC, 'CAP-CAMPAIGNS'],
        'lego_test': [MC] * 8,
        'definition_of_done': [MC],
    },
    '43_Subscription_Commerce': {
        'domain_objects': ['CAP-SUBSCRIPTION-COMMERCE', 'CAP-SUBSCRIPTION-COMMERCE', 'CAP-SUBSCRIPTION-COMMERCE', 'CAP-SUBC-CHANGE-PLAN'],
        'service_contract': ['CAP-SUBSCRIPTION-COMMERCE', 'CAP-SUBSCRIPTION-COMMERCE', 'CAP-SUBC-PAUSE', 'CAP-SUBC-PAUSE', 'CAP-SUBC-CHANGE-PLAN', 'CAP-SUBSCRIPTION-COMMERCE'],
        'events_published': ['CAP-SUBSCRIPTION-COMMERCE', 'CAP-SUBSCRIPTION-COMMERCE', 'CAP-SUBC-DUNNING', 'CAP-SUBC-PAUSE', 'CAP-SUBC-CHURN'],
        'events_consumed': ['CAP-SUBSCRIPTION-COMMERCE', 'CAP-SUBC-DUNNING', MC],
        'permissions': [MC, 'CAP-SUBSCRIPTION-COMMERCE', MC],
        'data_rules': ['CAP-SUBSCRIPTION-COMMERCE', MC, 'CAP-SUBSCRIPTION-COMMERCE'],
        'lego_test': [MC] * 7,
        'definition_of_done': [MC],
    },
    '19_POS_Retail': {
        'domain_objects': ['CAP-POS', 'CAP-POS', 'CAP-POS', 'CAP-POS-RECEIPT'],
        'service_contract': ['CAP-POS', 'CAP-POS', 'CAP-POS', 'CAP-POS', 'CAP-POS'],
        'events_published': ['CAP-POS', 'CAP-POS-RECEIPT', 'CAP-POS', 'CAP-POS'],
        'events_consumed': ['CAP-POS-INVENTORY-SYNC', MC, MC],
        'permissions': ['CAP-POS', 'CAP-POS', MC, 'CAP-POS'],
        'data_rules': [MC, 'CAP-POS', MC],
        'lego_test': [MC] * 8,
        'definition_of_done': [MC],
    },
    '12_OMS_Order_Orchestration': {
        'domain_objects': ['CAP-FULFILLMENT-ROUTING', 'CAP-FULFILLMENT-ROUTING', 'CAP-ORDER-EXCEPTION', 'CAP-FULFILLMENT-ROUTING'],
        'service_contract': ['CAP-FULFILLMENT-ROUTING', 'CAP-FULFILLMENT-ROUTING', 'CAP-FULFILLMENT-ROUTING', 'CAP-ORDER-SPLIT', 'CAP-ORDER-EXCEPTION'],
        'events_published': ['CAP-FULFILLMENT-ROUTING', 'CAP-ORDER-SPLIT', 'CAP-FULFILLMENT-ROUTING', 'CAP-ORDER-EXCEPTION'],
        'events_consumed': [MC, MC, 'CAP-FULFILLMENT-ROUTING', 'CAP-ORDER-EXCEPTION'],
        'permissions': [MC, 'CAP-FULFILLMENT-ROUTING', MC, 'CAP-FULFILLMENT-ROUTING'],
        'data_rules': [MC, 'CAP-FULFILLMENT-ROUTING', MC],
        'lego_test': [MC] * 8,
        'definition_of_done': [MC],
    },
    '05_CRM_Sales': {
        'domain_objects': ['CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-INTERACTION-HISTORY', 'CAP-SALES-PIPELINE'],
        'service_contract': ['CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-INTERACTION-HISTORY', 'CAP-SALES-PIPELINE'],
        'events_published': ['CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-INTERACTION-HISTORY'],
        'events_consumed': [MC, 'CAP-INTERACTION-HISTORY', 'CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', MC],
        'permissions': [MC, 'CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-SALES-PIPELINE', 'CAP-INTERACTION-HISTORY', MC],
        'data_rules': [MC, MC, MC, 'CAP-SALES-PIPELINE'],
        'lego_test': [MC] * 8,
        'definition_of_done': [MC],
    },
}


def main():
    items = json.loads((ROOT / 'generation/blueprint-architecture-items.json').read_text(encoding='utf-8'))['docs']
    caps = {c['id'] for c in json.loads((ROOT / 'capabilities/catalog.json').read_text(encoding='utf-8'))['capabilities']}
    by_module = {}
    for c in json.loads((ROOT / 'capabilities/catalog.json').read_text(encoding='utf-8'))['capabilities']:
        by_module.setdefault(c.get('module'), []).append(c['id'])

    cap_map: dict[str, list[dict]] = {}
    errors = []
    for did, sections in ASSIGNMENTS.items():
        if did not in items:
            errors.append(f'{did}: not present in blueprint-architecture-items.json'); continue
        for skey, assigned in sections.items():
            actual_items = items[did].get(skey, [])
            if len(assigned) != len(actual_items):
                errors.append(f'{did}/{skey}: assignment length {len(assigned)} != item count {len(actual_items)}')
                continue
            for idx, cid in enumerate(assigned):
                if cid != MC and cid not in caps:
                    errors.append(f'{did}/{skey}[{idx}]: unknown capability {cid}')
                cap_map.setdefault(cid, []).append({'doc_id': did, 'section': skey, 'item_index': idx})
    if errors:
        raise SystemExit('build_capability_item_map errors:\n' + '\n'.join(errors))

    modules_fine_grained = sorted(COVERED_MODULES)
    all_modules = sorted({m for m in by_module if m})
    modules_fallback = sorted(set(all_modules) - set(modules_fine_grained))
    zero_item_caps = []
    for mid in modules_fine_grained:
        for cid in by_module.get(mid, []):
            if cid not in cap_map:
                zero_item_caps.append(cid)

    payload = {
        'schema_version': '1.0.0',
        'generated_from': 'scripts/build_capability_item_map.py (hand-curated semantic mapping over generation/blueprint-architecture-items.json)',
        'covered_modules': COVERED_MODULES,
        'map': cap_map,
        'coverage': {
            'modules_fine_grained': modules_fine_grained,
            'modules_fine_grained_count': len(modules_fine_grained),
            'modules_fallback_full_content': modules_fallback,
            'modules_fallback_count': len(modules_fallback),
            'modules_total': len(all_modules),
            'docs_itemized_total': len(items),
            'docs_capability_mapped': sorted(ASSIGNMENTS),
            'capabilities_in_fine_grained_modules_with_zero_items': sorted(zero_item_caps),
            'note': 'Modules not in modules_fine_grained keep full-module BLUEPRINT_ARCHITECTURE.md content (unchanged fallback behavior). capabilities_in_fine_grained_modules_with_zero_items are real, honestly-reported gaps: the mechanically-extracted 8 sections of that module\'s blueprint doc never named that capability\'s specifics (often covered by non-extracted doc sections like Primary Workflows/AI Tool Surface); selecting only such a capability yields _module_common items only, never fabricated content.',
        },
    }
    out_path = ROOT / 'generation/blueprint-capability-item-map.json'
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(f'CAPABILITY-ITEM MAP: modules_fine_grained={len(modules_fine_grained)} modules_fallback={len(modules_fallback)} '
          f'capabilities_mapped={len(cap_map)} zero_item_caps={len(zero_item_caps)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
