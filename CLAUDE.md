# Project Instructions

## Context
Learning the Claude Agent SDK by building focused examples. See `plan.md` for progress and next steps.

## On Startup
1. Read `plan.md` to understand progress
2. Check completed `learnings.md` files for context
3. Continue with the next ⏳ UP NEXT module

## When Running Examples
- Log output to the **example's directory**: `examples/<module>/output-{YYYYMMDD-HHMM}.log`
- Use: `npm run <script> 2>&1 | tee examples/<module>/output-$(date +%Y%m%d-%H%M).log`
- Example: `npm run custom-tools 2>&1 | tee examples/03-custom-tools/output-$(date +%Y%m%d-%H%M).log`

## Module Workflow
1. **Write code** - Create `index.ts` with the example implementation
2. **Run & log** - Execute and capture output to the example directory
3. **Pause for review** - Stop and let user review the output log, ask questions, iterate
4. **Draft learnings** - Only after user confirms, write `learnings.md`
5. **Update plan** - Mark module as completed in `plan.md`

## Communication Style
- Be concise in explanations and learnings
- Keep `learnings.md` files focused and scannable
- Use tables and bullet points over prose
- Skip obvious details; focus on insights and gotchas
