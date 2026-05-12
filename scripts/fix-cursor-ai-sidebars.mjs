#!/usr/bin/env node
/**
 * Re-apply Cursor workaround: force Codex + Claude Code into the activity bar
 * instead of secondarySidebar (Cursor often lacks codexSecondaryViewContainer /
 * claude-sidebar-secondary, which triggers fallbacks into Explorer).
 *
 * Run after extension updates if icons vanish again:
 *   node scripts/fix-cursor-ai-sidebars.mjs
 *
 * Then: Ctrl+Shift+P → Developer: Reload Window
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXT_ROOT = path.join(
	process.env.USERPROFILE || process.env.HOME || "",
	".cursor",
	"extensions",
);

function findLatestDir(prefix) {
	if (!fs.existsSync(EXT_ROOT)) {
		console.error("Extensions folder missing:", EXT_ROOT);
		return null;
	}
	const dirs = fs
		.readdirSync(EXT_ROOT, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name.startsWith(prefix))
		.map((d) => d.name)
		.sort()
		.reverse();
	return dirs[0] ? path.join(EXT_ROOT, dirs[0]) : null;
}

function writePkg(pkgPath, pkg) {
	fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t") + "\n", "utf8");
}

/** @returns {boolean} */
function patchCodex(pkg) {
	const c = pkg.contributes;
	if (!c?.viewsContainers?.activitybar) return false;
	const activity = c.viewsContainers.activitybar.find(
		(x) => x.id === "codexViewContainer",
	);
	if (!activity) return false;
	const view = c.views?.codexViewContainer?.[0];
	if (!view) return false;

	c.viewsContainers = {
		activitybar: [
			{
				id: activity.id,
				title: activity.title,
				icon: activity.icon,
			},
		],
	};
	c.views = {
		codexViewContainer: [
			{
				id: view.id,
				type: view.type,
				name: view.name,
			},
		],
	};
	return true;
}

/** @returns {boolean} */
function patchClaudeCode(pkg) {
	const c = pkg.contributes;
	const bar = c?.viewsContainers?.activitybar;
	if (!Array.isArray(bar)) return false;

	const primary = bar.find((x) => x.id === "claude-sidebar");
	const sessions = bar.find((x) => x.id === "claude-sessions-sidebar");
	const nextBar = [];
	if (primary) {
		nextBar.push({
			id: primary.id,
			title: primary.title,
			icon: primary.icon,
		});
	}
	if (sessions) {
		const row = {
			id: sessions.id,
			title: sessions.title,
			icon: sessions.icon,
		};
		if (sessions.when) row.when = sessions.when;
		nextBar.push(row);
	}
	if (nextBar.length === 0) return false;

	const vs = c.views || {};
	const mainView = vs["claude-sidebar"]?.[0];
	const sessViews = vs["claude-sessions-sidebar"];

	const nextViews = {};
	if (mainView) {
		nextViews["claude-sidebar"] = [
			{
				type: mainView.type,
				id: mainView.id,
				name: mainView.name,
			},
		];
	}
	if (sessViews) {
		nextViews["claude-sessions-sidebar"] = sessViews;
	}

	c.viewsContainers = { activitybar: nextBar };
	c.views = nextViews;
	return true;
}

function main() {
	console.log("Extensions root:", EXT_ROOT);

	const codexDir = findLatestDir("openai.chatgpt-");
	const claudeDir = findLatestDir("anthropic.claude-code-");

	let ok = 0;

	if (codexDir) {
		const p = path.join(codexDir, "package.json");
		const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
		if (patchCodex(pkg)) {
			writePkg(p, pkg);
			console.log("Patched Codex:", p);
			ok++;
		} else {
			console.warn("Skipped Codex (unexpected structure):", p);
		}
	} else {
		console.warn("No openai.chatgpt-* folder under .cursor/extensions");
	}

	if (claudeDir) {
		const p = path.join(claudeDir, "package.json");
		const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
		if (patchClaudeCode(pkg)) {
			writePkg(p, pkg);
			console.log("Patched Claude Code:", p);
			ok++;
		} else {
			console.warn("Skipped Claude Code (unexpected structure):", p);
		}
	} else {
		console.warn("No anthropic.claude-code-* folder under .cursor/extensions");
	}

	if (ok === 0) {
		console.error("Nothing patched. Install extensions or check paths.");
		process.exit(1);
	}

	console.log("\nDone. Reload Cursor: Ctrl+Shift+P → Developer: Reload Window");
}

main();
