---
description: "Generate a contract-first implementation plan for creating or extending a game in VEX before writing code."
name: "VEX New Game Contract-First Plan"
argument-hint: "اكتب اسم اللعبة/الميزة الجديدة ونطاقها (engine/realtime/ui/watch)."
agent: "VEX Games Specialist"
---
Create a production-grade, contract-first plan for the following VEX game task:

Use the user-provided prompt argument as the exact task input and scope baseline.

Requirements:
1. Do NOT write code yet; produce an execution blueprint only.
2. Base the plan on this project architecture and existing game patterns.
3. Cover all layers:
   - Engine/rules contract
   - Realtime websocket message contract
   - Challenge page UX contract
   - Watch/spectator contract
   - Settlement/edge-case safety contract
4. Include explicit file-level touch map (expected files/folders to change).
5. Provide validation matrix with exact commands to run.
6. Include abuse/fairness risks and how to mitigate them.
7. End with phased delivery (Phase 1/2/3) and merge readiness checklist.

Use these repository references in the plan:
- [Watch UX playbook](../../docs/GAME_WATCH_UNIFIED_UX_PLAYBOOK.md)
- [Permissions audit baseline](../../docs/CHALLENGE_PERMISSIONS_AUDIT_2026-03-30.md)
- [Gameplay regression smoke](../../scripts/smoke-challenge-gameplay-regression.ts)
- [Challenge permissions smoke](../../scripts/smoke-challenge-permissions.mjs)
