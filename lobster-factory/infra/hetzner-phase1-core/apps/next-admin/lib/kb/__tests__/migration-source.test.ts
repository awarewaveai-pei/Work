// findDefiner()/creates() against synthetic fixtures. The real migrations directory doesn't happen
// to contain a plain `CREATE FUNCTION` (no OR REPLACE) or a dropped-without-replacement function,
// so those two paths — the ones a critic review found this guard could silently miss — need
// fixtures built by hand rather than the real files.

import { describe, expect, it } from "vitest";
import { creates, findDefiner } from "./migration-source";

describe("creates()", () => {
  it("matches CREATE OR REPLACE FUNCTION", () => {
    expect(creates("widget").test("CREATE OR REPLACE FUNCTION public.widget(a int)")).toBe(true);
  });

  it("matches plain CREATE FUNCTION -- nothing requires a migration to say OR REPLACE", () => {
    expect(creates("widget").test("CREATE FUNCTION public.widget(a int)")).toBe(true);
  });

  it("does not match a different function of the same prefix", () => {
    expect(creates("widget").test("CREATE FUNCTION public.widget_v2(a int)")).toBe(false);
  });
});

describe("findDefiner()", () => {
  it("throws when nothing defines the function", () => {
    expect(() => findDefiner("ghost", [{ file: "0001.sql", text: "CREATE TABLE t (id int);" }])).toThrow(
      /no migration defines/,
    );
  });

  it("picks the newest of several definitions", () => {
    const files = [
      { file: "0001.sql", text: "CREATE FUNCTION public.f(a int) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;" },
      { file: "0002.sql", text: "CREATE OR REPLACE FUNCTION public.f(a int) RETURNS int LANGUAGE sql AS $$ SELECT 2 $$;" },
    ];
    expect(findDefiner("f", files).file).toBe("0002.sql");
  });

  it("finds a plain CREATE FUNCTION with no OR REPLACE at all", () => {
    // This is the exact gap a critic review found: the original regex required "OR REPLACE"
    // literally, so a migration author who wrote plain CREATE FUNCTION would leave this guard
    // silently pointed at whatever it found before -- not throwing, just wrong.
    const files = [{ file: "0001.sql", text: "CREATE FUNCTION public.f(a int) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;" }];
    expect(findDefiner("f", files).file).toBe("0001.sql");
  });

  it("throws when a later migration drops the function without redefining it", () => {
    const files = [
      { file: "0001.sql", text: "CREATE FUNCTION public.f(a int) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;" },
      { file: "0002.sql", text: "DROP FUNCTION IF EXISTS public.f(int);" },
    ];
    expect(() => findDefiner("f", files)).toThrow(/drops public\.f without redefining it/);
  });

  it("does not throw when a drop is immediately followed by a re-create in the same migration", () => {
    // The normal case: 0072's own pattern of DROP-then-CREATE to change a RETURNS shape.
    const files = [
      { file: "0001.sql", text: "CREATE FUNCTION public.f(a int) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;" },
      {
        file: "0002.sql",
        text: "DROP FUNCTION IF EXISTS public.f(int);\nCREATE FUNCTION public.f(a int, b int) RETURNS int LANGUAGE sql AS $$ SELECT 2 $$;",
      },
    ];
    expect(findDefiner("f", files).file).toBe("0002.sql");
  });
});
