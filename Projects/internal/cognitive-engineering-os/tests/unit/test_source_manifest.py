"""Tests for ``ai_lego.modules.research.source_manifest`` (P2 WC-01, P-a/P-c).

Covers ``build_source_manifest`` (superseded exclusion, 6000-char truncation,
batch splitting past 40, stable ordering), the verbatim ``report.ts:93-105``
block template, and ``resolve_citation_numbers`` (known + unknown ``[n]``)."""

from __future__ import annotations

import unittest

from ai_lego.modules.research.source_manifest import (
    build_source_manifest,
    render_source_block,
    resolve_citation_numbers,
)


def _source(source_id: str, *, status: str = "active", created_at: str = "2026-01-01T00:00:00Z", text: str = "hello world", **extra):
    row = {
        "source_id": source_id,
        "status": status,
        "created_at": created_at,
        "text": text,
        "content_sha256": f"sha-{source_id}",
        "title": f"Title {source_id}",
        "url": f"https://example.com/{source_id}",
        "fetched_at": "2026-01-02T00:00:00Z",
        "source_class": "web",
    }
    row.update(extra)
    return row


class BuildSourceManifestTests(unittest.TestCase):
    def test_superseded_sources_are_excluded(self):
        manifest = build_source_manifest([_source("a"), _source("b", status="superseded")])
        ids = [entry["id"] for entry in manifest["entries"]]
        self.assertEqual(ids, ["source:a"])

    def test_text_past_max_chars_is_truncated_to_the_window(self):
        manifest = build_source_manifest([_source("a", text="x" * 7000)], max_chars=6000)
        entry = manifest["entries"][0]
        self.assertEqual(entry["start"], 0)
        self.assertEqual(entry["end"], 6000)

    def test_text_under_max_chars_keeps_its_own_length(self):
        manifest = build_source_manifest([_source("a", text="short")], max_chars=6000)
        entry = manifest["entries"][0]
        self.assertEqual(entry["end"], len("short"))

    def test_41_sources_split_into_two_batches(self):
        sources = [_source(f"s{i:02d}", created_at=f"2026-01-01T00:{i:02d}:00Z") for i in range(41)]
        manifest = build_source_manifest(sources, batch_size=40)
        self.assertEqual(len(manifest["batches"]), 2)
        self.assertEqual(len(manifest["batches"][0]), 40)
        self.assertEqual(len(manifest["batches"][1]), 1)
        self.assertEqual(manifest["batches"][0][0], 1)
        self.assertEqual(manifest["batches"][1][0], 41)

    def test_ordering_is_stable_by_created_at_then_source_id(self):
        sources = [
            _source("z", created_at="2026-01-01T00:00:00Z"),
            _source("a", created_at="2026-01-01T00:00:00Z"),
            _source("m", created_at="2025-12-31T00:00:00Z"),
        ]
        manifest = build_source_manifest(sources)
        self.assertEqual([entry["source_id"] for entry in manifest["entries"]], ["m", "a", "z"])
        self.assertEqual([entry["n"] for entry in manifest["entries"]], [1, 2, 3])

    def test_entry_shape_matches_p_a(self):
        manifest = build_source_manifest([_source("a")])
        entry = manifest["entries"][0]
        self.assertEqual(
            set(entry),
            {"n", "id", "source_id", "sha256", "start", "end", "title", "url", "fetched_at", "source_class"},
        )
        self.assertEqual(entry["id"], "source:a")
        self.assertTrue(0 <= entry["start"] < entry["end"])

    def test_manifest_sha256_is_deterministic_over_entries(self):
        sources = [_source("a"), _source("b", created_at="2026-01-02T00:00:00Z")]
        first = build_source_manifest(sources)["sha256"]
        second = build_source_manifest(sources)["sha256"]
        self.assertEqual(first, second)


class RenderSourceBlockTests(unittest.TestCase):
    def test_block_uses_verbatim_fence_markers(self):
        manifest = build_source_manifest([_source("a", text="the body")])
        entry = manifest["entries"][0]
        block = render_source_block(entry, "the body")
        self.assertTrue(block.startswith("<<<SOURCE 1 BEGIN>>>\n"))
        self.assertTrue(block.endswith("<<<SOURCE 1 END>>>"))
        self.assertIn("the body", block)
        self.assertIn(entry["url"], block)


class ResolveCitationNumbersTests(unittest.TestCase):
    def test_known_int_is_resolved_to_manifest_id(self):
        manifest = build_source_manifest([_source("a"), _source("b", created_at="2026-01-02T00:00:00Z")])
        obj = {"claims": [{"text": "x", "citations": [1, 2]}]}
        resolved = resolve_citation_numbers(obj, manifest["entries"])
        self.assertEqual(resolved["claims"][0]["citations"], ["source:a", "source:b"])

    def test_unknown_int_is_preserved_not_dropped(self):
        manifest = build_source_manifest([_source("a")])
        obj = {"claims": [{"text": "x", "citations": [1, 99]}]}
        resolved = resolve_citation_numbers(obj, manifest["entries"])
        self.assertEqual(resolved["claims"][0]["citations"], ["source:a", 99])


if __name__ == "__main__":
    unittest.main()
