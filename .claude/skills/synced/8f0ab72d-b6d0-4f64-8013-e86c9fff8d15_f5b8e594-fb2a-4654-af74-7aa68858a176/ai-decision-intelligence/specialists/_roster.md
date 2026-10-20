# Specialist Roster

This skill ships with 3 fully-detailed specialists (`wordpress.md`, `compliance.md`, `scalability.md`) covering the most common high-impact domain triggers. Additional specialists below are scaffolded with their core focus and required output schema. They can be elaborated as the user encounters cases where they're triggered.

If you trigger a specialist that's only scaffolded here, write the review using the structure below + your domain knowledge for the specific candidate set. Apply the same quality standard as the fully-detailed specialists.

---

## Common output schema for ALL specialists

Every specialist (regardless of which) produces this structure:

```json
{
  "reviews": [
    {
      "candidate_id": "<id>",
      "domain_fit_score": <1-10>,
      "domain_specific_concerns": [
        "<concern with specific mechanism>"
      ],
      "domain_specific_advantages": [
        "<advantage with evidence>"
      ],
      "real_world_observation": "<from your domain experience>",
      "challenge_to_other_reviewers": "<what generic reviewers might miss in this domain>"
    }
  ],
  "comparative_summary": "<3-5 sentences specific to domain>"
}
```

---

## ai-ml.md — AI/ML Systems

**Triggers:** LLM, RAG, embedding, vector DB, fine-tuning, model serving, ML pipeline.

**Focus areas:**
- Model lifecycle (training, eval, deployment, monitoring)
- Cost shape (token-based pricing, GPU-hour pricing)
- Latency requirements (interactive vs batch)
- Hallucination handling and evaluation
- Vendor lock-in (proprietary models vs open weights)
- Data privacy of inference (does prompt go to vendor?)

**Common failure modes to look for:**
- Estimating LLM cost without modeling token usage
- Ignoring eval/observability for ML systems
- Treating "fine-tuning" as a magic fix for prompt engineering
- Underestimating time-to-value for RAG systems

---

## data.md — Data Pipeline / Warehouse Expert

**Triggers:** ETL, ELT, data warehouse, data lake, dbt, Airflow, analytics pipeline, data engineering.

**Focus areas:**
- Schema evolution handling
- Data quality / observability
- Cost shape (storage tier, compute tier, query patterns)
- Vendor lock-in (proprietary SQL dialects)
- Lineage and audit
- Backup and disaster recovery for data

**Common failure modes:**
- Underestimating compute costs at scale
- Ignoring schema migration pain
- Missing data quality monitoring

---

## seo.md — SEO Expert

**Triggers:** SEO, ranking, organic traffic, Core Web Vitals, schema.org, structured data.

**Focus areas:**
- Page speed implications (LCP, FID, CLS)
- JavaScript rendering for search engines
- URL structure and migration handling
- Structured data preservation
- HTTP redirect strategy during changes
- International SEO (hreflang, geo-targeting)

**Common failure modes:**
- "Modern stack" choices that hurt SEO (heavy JS rendering)
- Migration that breaks URL structure without redirects
- Page speed regression from added features

---

## infra.md — Infrastructure / IaC Expert

**Triggers:** Terraform, Pulumi, CloudFormation, VPC, networking, IAM, infrastructure design.

**Focus areas:**
- IaC best practices (state management, modules, environments)
- Multi-environment strategy
- Cost allocation (tagging, billing visibility)
- Security baseline (IAM least-privilege, network segmentation)
- Disaster recovery infrastructure

**Common failure modes:**
- Hard-coded resources (not parameterized)
- Missing state backup
- Over-permissive IAM

---

## mobile.md — Mobile Expert

**Triggers:** iOS, Android, React Native, Flutter, mobile app, App Store, Play Store.

**Focus areas:**
- Platform-specific reviews (App Store, Play Store)
- Update mechanism (force-update, soft-prompt)
- Offline-first capabilities
- Native vs cross-platform tradeoffs
- Push notification reliability
- Crash reporting and analytics

**Common failure modes:**
- Ignoring App Store review requirements
- Not planning for forced updates
- Cross-platform "for free" being more expensive than expected

---

## kubernetes.md — Kubernetes / Container Orchestration Expert

**Triggers:** Kubernetes, K8s, service mesh, container orchestration, EKS, GKE, AKS.

**Focus areas:**
- When K8s is justified (vs simpler alternatives)
- Operational complexity tax
- Multi-tenancy patterns
- Networking (CNI, ingress, service mesh)
- Cost (control plane + node fleet)
- Skill requirements (often underestimated)

**Common failure modes:**
- Adopting K8s for hype, not justified by scale
- Underestimating operational burden
- Service mesh adoption when not needed

---

## ecommerce.md — E-commerce Expert

**Triggers:** Shopify, WooCommerce, BigCommerce, ecommerce, checkout, cart, payment processing.

**Focus areas:**
- Payment gateway integration (multiple providers, fallback)
- Cart abandonment recovery
- Tax calculation (international complexity)
- Inventory sync across channels
- Fraud detection
- PCI scope reduction

**Common failure modes:**
- Underestimating tax/compliance complexity (multi-jurisdiction)
- Not planning for cart recovery
- Single payment gateway (no fallback)

---

## finops.md — FinOps / Cloud Cost Expert

**Triggers:** Cloud cost optimization, AWS bill, FinOps, budget, cost allocation.

**Focus areas:**
- Reserved instance / commitment strategy
- Right-sizing analysis
- Egress cost reduction
- Storage tier optimization
- Tagging discipline for visibility
- Cost-aware architecture decisions

**Common failure modes:**
- Optimizing compute while bandwidth dominates bill
- Buying RIs without usage validation
- No tagging means no visibility

---

## ux.md — UX / Accessibility Expert

**Triggers:** UX, accessibility, a11y, WCAG, design system, user research.

**Focus areas:**
- WCAG conformance (A, AA, AAA targets)
- Keyboard navigation
- Screen reader compatibility
- Color contrast
- Cognitive load on user flows
- Error message quality

**Common failure modes:**
- Treating accessibility as afterthought
- "Designed for users like us" — not testing with diverse users
- Ignoring legal accessibility requirements (ADA, EU directive)
