# Vendor Exit Test Standard

This is the commercial/external counterpart to `assurance/30_YEAR_REPLACEMENT_TEST.md`: for every critical vendor, is there a concretely planned exit, not merely an assumed one.

Required per critical vendor (`engineering/VENDOR_INDEPENDENCE_STANDARD.md`): what functionality/data would be affected if this vendor became unavailable or had to be replaced, a realistic estimate of migration time and cost (not an optimistic guess), the data-extraction path for anything the vendor holds (`engineering/DATA_PORTABILITY_STANDARD.md`), and an identified replacement candidate or class of candidates — "there is no alternative" is itself a finding that MUST be escalated, not silently accepted.

The exit plan MUST be re-evaluated whenever usage of the vendor grows materially or the vendor's terms change, since switch cost tends to increase silently over time as integration deepens. A vendor with no adapter boundary (`engineering/PROVIDER_RESILIENCE_STANDARD.md`) fails this test by construction regardless of how good its exit plan reads on paper.
