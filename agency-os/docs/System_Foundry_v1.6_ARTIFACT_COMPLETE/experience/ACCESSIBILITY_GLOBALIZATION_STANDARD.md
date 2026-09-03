# Accessibility & Globalization Standard

## Applicability
Mandatory for web/mobile/desktop human-facing products and operator consoles. Other archetypes must record N/A or applicable subset.

## Accessibility baseline
- target WCAG level is explicitly selected; default target for general web products is WCAG 2.2 AA unless a stricter contractual/regulatory target applies
- semantic structure and accessible names
- keyboard-only operation for all critical workflows
- visible focus and deterministic focus management
- screen-reader compatible status/error feedback
- contrast and non-color-only state communication
- zoom/reflow/responsive behavior
- motion/reduced-motion handling where relevant
- captions/transcripts for required media
- automated checks plus manual critical-journey verification

## Globalization baseline
- locale-independent domain data
- Unicode end-to-end
- names are not assumed to be Western first/last pairs
- timezone is explicit at boundaries; persisted instants and displayed local time are distinguished
- locale-aware number/currency/date formatting
- calendar assumptions are explicit
- RTL readiness when supported markets require it
- translation keys are separated from domain/business logic
- sorting/search/collation behavior is specified

## Rule
Global use and accessibility are designed at contract/schema/UI boundaries before implementation, not bolted on after product completion.
