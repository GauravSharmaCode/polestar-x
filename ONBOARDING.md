# Welcome to PoleStar-X

## How We Use Claude

Based on Gaurav Sharma's usage over the last 30 days:

Work Type Breakdown:
  Plan Design    ████████████████████  100%

Top Skills & Commands:
  /model         ████████████████████   1x/month
  /effort        ████████████████████   1x/month

Top MCP Servers:
  (none recorded in this window)

## Your Setup Checklist

### Codebases
- [ ] polestar-x — https://github.com/gauravsharmacode/polestar-x

### MCP Servers to Activate
  (none in use — check back after onboarding)

### Skills to Know About
- /model — switch the underlying Claude model mid-session (e.g. Sonnet for speed, Opus for depth)
- /effort — dial reasoning depth; xhigh gives deeper analysis just below maximum

## Team Tips

- **Check Feasibility before picking a task.** Every task is tagged Ext Layer, Pi Hook, or Pi Core. Start with Ext Layer — those are doable entirely inside `packages/polestar/src/extension/` without touching pi internals.
- **Always work in a git worktree.** Use `git worktree add -b your-branch ../polestar-x-your-branch HEAD` so your changes don't block the main tree. Merge is Gaurav's call.
- **Tasks have a Source field.** When you complete something with Claude Code's help, set Source → Claude Code so the team can see what the agent delivered.
- **Run `scripts/smoke-local.sh` before opening a PR.** It packs the package, installs it globally from the tarball, and runs every gate. This is the check 0.1.0 was missing.
- **The Feasibility tags define the blast radius.** Ext Layer = safe to ship fast. Pi Hook = needs upstream review. Pi Core = fork territory — flag it first.

## Get Started

Good first task: **[Add classify-task tests](https://app.notion.com/p/374dfc898a5981778d07c249883a0190)**

> The router has real complexity-scoring logic with zero tests. Add 8–10 vitest cases in `src/router/classify-task.test.ts` covering: single-line command, multi-line plan, privacy keyword, short question, architecture phrase, debugging prompt, stuck-session simulation.

- Category: Testing · Priority: P1 · Effort: Days · Milestone: v0.2.0 · Feasibility: Ext Layer
- Full task board: https://www.notion.so/8e5306aa8bab4d55af48daed6d67ce36?v=fa92ae57666244f39f9c1c1cfd5ca1f6

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
