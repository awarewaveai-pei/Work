"""The Codex card queue is structurally safe before the driver runs it."""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import re
import shutil
import tempfile
import unittest


QUEUE_REL = Path("agency-os/handoffs/cos-codex-queue")
COS_TESTS_REL = Path("Projects/internal/cognitive-engineering-os/tests")
REQUIRED_TOKENS = ("CARD_DONE", "DECISION_NEEDED:", "BLOCKED:")
HIGH_STOP_COMMANDS = ("docker compose up", "ssh", "safe-infra-patch", "git push", "apply-db-migration")
UNITTEST_COMMAND = re.compile(r"^python\s+-m\s+unittest(?:\s+(.+?))?\s*$")
UNITTEST_MODULE = re.compile(r"^tests\.unit(?:\.[A-Za-z_]\w*)+$")
CARD_NUMBER = re.compile(r"^(\d+)-")
GATE_LINE = re.compile(r"^\s*-\s+([^:\s]+)\s*:")


def _repository_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "agency-os").is_dir():
            return candidate
    raise RuntimeError("could not find repository root containing agency-os")


def _inside(path: Path, folder: Path) -> bool:
    try:
        path.relative_to(folder)
    except ValueError:
        return False
    return True


def _card_text(queue_root: Path, card_file: object) -> str:
    if not isinstance(card_file, str) or not card_file:
        return ""
    path = (queue_root / card_file).resolve()
    if not _inside(path, queue_root.resolve()) or not path.is_file():
        return ""
    return path.read_text(encoding="utf-8")


def _module_is_named_in_card(module: str, card_text: str) -> bool:
    path_name = module.replace(".", "/")
    leaf = module.rsplit(".", 1)[-1]
    return any(name in card_text for name in (module, path_name, f"{path_name}.py", leaf, f"{leaf}.py"))


def validate_queue(queue: dict, base_folder: Path) -> list[str]:
    """Return every queue contract violation, using only the supplied queue and base folder."""
    errors: list[str] = []
    base = Path(base_folder).resolve()
    queue_root = base / QUEUE_REL
    cards = queue.get("cards") if isinstance(queue, dict) else None
    if not isinstance(cards, list) or not cards:
        errors.append("queue.cards must be a non-empty list")
        cards = []

    ids: list[str | None] = []
    for index, card in enumerate(cards):
        if not isinstance(card, dict):
            errors.append(f"card {index} must be an object")
            ids.append(None)
            continue

        required = {"id", "file", "check", "depends", "gate", "high_stop"}
        missing = sorted(required - card.keys())
        if missing:
            errors.append(f"card {index} missing fields: {', '.join(missing)}")

        card_id = card.get("id")
        ids.append(card_id if isinstance(card_id, str) and card_id else None)
        if not isinstance(card_id, str) or not card_id:
            errors.append(f"card {index} id must be a non-empty string")
        elif not CARD_NUMBER.match(card_id):
            errors.append(f"card {card_id}: id must start with a card number")

        card_file = card.get("file")
        text = _card_text(queue_root, card_file)
        if not isinstance(card_file, str) or not card_file:
            errors.append(f"card {card_id!r}: file must be a non-empty string")
        else:
            path = (queue_root / card_file).resolve()
            if not _inside(path, queue_root.resolve()):
                errors.append(f"card {card_id}: file escapes the queue folder")
            elif not path.is_file():
                errors.append(f"card {card_id}: file does not exist: {card_file}")
            else:
                first_line = text.splitlines()[0] if text.splitlines() else ""
                number = CARD_NUMBER.match(card_id).group(1) if CARD_NUMBER.match(card_id) else "?"
                if not first_line.startswith(f"# Card {number}"):
                    errors.append(f"card {card_id}: file must start with '# Card {number}'")

        checks = card.get("check")
        if not isinstance(checks, list) or not checks:
            errors.append(f"card {card_id}: check must be a non-empty list")
            checks = []
        for check_index, check in enumerate(checks):
            if not isinstance(check, dict):
                errors.append(f"card {card_id}: check {check_index} must be an object")
                continue
            command = check.get("cmd")
            if not isinstance(command, str) or not command.strip():
                errors.append(f"card {card_id}: check {check_index} cmd must be non-empty")
                continue
            if "cwd" in check and check["cwd"] is not None and not isinstance(check["cwd"], str):
                errors.append(f"card {card_id}: check {check_index} cwd must be a string")

            match = UNITTEST_COMMAND.match(command.strip())
            if match:
                module_text = (match.group(1) or "").strip()
                module = module_text.split()[0] if module_text else ""
                if not module:
                    errors.append(f"card {card_id}: unittest check {check_index} has no module")
                elif not UNITTEST_MODULE.fullmatch(module):
                    errors.append(f"card {card_id}: unittest module is outside tests.unit: {module}")
                else:
                    module_path = base / COS_TESTS_REL.parent / Path(*module.split("."))
                    module_path = module_path.with_suffix(".py")
                    if not module_path.is_file() and not _module_is_named_in_card(module, text):
                        errors.append(f"card {card_id}: missing unittest module is not named in its card: {module}")

            if card.get("high_stop") is True:
                lowered = command.casefold()
                for forbidden in HIGH_STOP_COMMANDS:
                    if forbidden in lowered:
                        errors.append(f"card {card_id}: high_stop check contains forbidden command: {forbidden}")

        depends = card.get("depends")
        if not isinstance(depends, list):
            errors.append(f"card {card_id}: depends must be a list")
        elif any(not isinstance(dependency, str) or not dependency for dependency in depends):
            errors.append(f"card {card_id}: depends entries must be non-empty strings")

        gate = card.get("gate")
        if gate is not None and not isinstance(gate, str):
            errors.append(f"card {card_id}: gate must be a string or null")
        if type(card.get("high_stop")) is not bool:
            errors.append(f"card {card_id}: high_stop must be a boolean")

    seen: set[str] = set()
    for index, card in enumerate(cards):
        if not isinstance(card, dict):
            continue
        card_id = ids[index]
        if card_id is not None:
            if card_id in seen:
                errors.append(f"duplicate card id: {card_id}")
            seen.add(card_id)
        depends = card.get("depends")
        if isinstance(depends, list):
            for dependency in depends:
                if not isinstance(dependency, str) or dependency not in seen:
                    errors.append(f"card {card_id}: dependency is not an earlier card: {dependency}")

    gates_readme = queue_root / "gates" / "README.md"
    if not gates_readme.is_file():
        errors.append("gates/README.md does not exist")
        gate_names: set[str] = set()
    else:
        gate_names = {match.group(1) for line in gates_readme.read_text(encoding="utf-8").splitlines() if (match := GATE_LINE.match(line))}
    for card in cards:
        if isinstance(card, dict) and isinstance(card.get("gate"), str) and card["gate"] not in gate_names:
            errors.append(f"card {card.get('id')}: gate is not documented: {card['gate']}")

    for relative, label in ((QUEUE_REL / "PREAMBLE.md", "PREAMBLE.md"), (Path("scripts/codex-continue.ps1"), "scripts/codex-continue.ps1")):
        path = base / relative
        if not path.is_file():
            errors.append(f"{label} does not exist")
            continue
        text = path.read_text(encoding="utf-8")
        for token in REQUIRED_TOKENS:
            if token not in text:
                errors.append(f"{label} is missing {token}")

    return errors


class CodexQueueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.repo = _repository_root()
        cls.queue_root = cls.repo / QUEUE_REL
        cls.queue_path = cls.queue_root / "queue.json"
        cls.queue = json.loads(cls.queue_path.read_text(encoding="utf-8"))

    def _temporary_repo(self, queue: dict) -> tempfile.TemporaryDirectory[str]:
        temporary = tempfile.TemporaryDirectory()
        base = Path(temporary.name)
        queue_root = base / QUEUE_REL
        queue_root.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(self.queue_root, queue_root)
        scripts = base / "scripts"
        scripts.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self.repo / "scripts" / "codex-continue.ps1", scripts / "codex-continue.ps1")
        test_unit = base / COS_TESTS_REL / "unit"
        test_unit.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self.repo / COS_TESTS_REL / "unit" / "test_codex_queue.py", test_unit / "test_codex_queue.py")
        (queue_root / "queue.json").write_text(json.dumps(queue), encoding="utf-8")
        return temporary

    def test_the_real_queue_is_valid(self) -> None:
        self.assertEqual(validate_queue(self.queue, self.repo), [])

    def test_broken_copies_are_reported_by_the_same_validator(self) -> None:
        cases = {
            "duplicate id": (lambda queue: queue["cards"].append(deepcopy(queue["cards"][0])), "duplicate card id"),
            "missing file": (lambda queue: queue["cards"][0].update(file="cards/does-not-exist.md"), "file does not exist"),
            "forward dependency": (lambda queue: queue["cards"][0].update(depends=["02-cognitive-db-ops"]), "not an earlier card"),
            "empty command": (lambda queue: queue["cards"][0]["check"][0].update(cmd=""), "cmd must be non-empty"),
            "high stop ssh": (lambda queue: (queue["cards"][0].update(high_stop=True), queue["cards"][0]["check"][0].update(cmd="ssh host true")), "forbidden command: ssh"),
        }
        for name, (mutate, expected) in cases.items():
            with self.subTest(name=name):
                broken = deepcopy(self.queue)
                mutate(broken)
                temporary = self._temporary_repo(broken)
                try:
                    errors = validate_queue(broken, Path(temporary.name))
                finally:
                    temporary.cleanup()
                self.assertTrue(any(expected in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
