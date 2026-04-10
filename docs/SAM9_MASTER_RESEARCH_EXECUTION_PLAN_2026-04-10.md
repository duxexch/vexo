# SAM9 Master Research And Execution Plan

Date: 2026-04-10
Owner: VEX SAM9 Track
Status: Draft v1 (research-backed, implementation-ready)

## 1) Product Goal

Build SAM9 as a production AI agent that can:
- Talk naturally with users in Arabic/English while clearly disclosing it is an AI.
- Act as real support (triage, guide, solve, escalate with context).
- Produce management reports automatically (daily/weekly/incidents).
- Assist admins as a project manager + product analyst + technical advisor.
- Suggest safe, measurable improvements to games/challenge flows.

Important: human-like style means clarity, empathy, and flexibility, not pretending to be human.

## 2) Current Baseline In This Repo

SAM9 already has a strong foundation:
- AI service runtime and learning core:
  - ai-service/src/sam9-core.mjs
- Server integration for AI service and privacy-safe payload handling:
  - server/lib/ai-agent-client.ts
- Admin endpoints for report/capabilities/runtime/data/chat/self-tune:
  - server/admin-routes/admin-ai-agent.ts
- Admin control center UI:
  - client/src/pages/admin/admin-sam9.tsx
- Support chat path with SAM9-first then human handoff:
  - server/routes/support-chat/support-messages.ts
- SAM9 challenge integration (solo mode, fixed fee, bot lifecycle):
  - server/routes/challenges/create.ts

Conclusion: this is not a greenfield. We should evolve architecture, not rewrite.

## 3) Gap Analysis (Current vs Target)

### Already Good
- Runtime control (start/stop) exists.
- Privacy-safe sanitization and pseudonymization exist.
- Admin report/data query endpoints exist.
- Support chat can escalate to live human chat.
- Basic autonomous tuning exists.

### Missing For Target Vision
- Persistent conversational memory per admin/user thread (long-horizon intent tracking).
- Structured task execution layer ("do X" with explicit tool contracts, progress, result, failure reason).
- Project-manager mode (roadmap, risk register, release checklist, dependency map).
- Developer-assistant mode tied to repository facts (not generic advice only).
- Quality evaluation loop for support/chat realism (turn quality, resolution quality, escalation precision).
- Human-style conversation policy pack (tone variants, de-escalation, empathy templates, strict non-deception rules).

## 4) External Research Insights (Free/Open Source)

## Adopt Now
- Rasa fallback/handoff patterns:
  - confidence and ambiguity thresholds
  - two-stage clarification before escalation
  - context-aware human handoff with transcript summary
- OpenTelemetry core signals:
  - traces + metrics + logs correlation for agent requests and outcomes
- LangGraph/Semantic orchestration concepts:
  - stateful execution graph
  - checkpoints/thread state
  - controlled tool routing and interrupts
- OpenSpiel-style evaluation mindset:
  - seeded and reproducible bot-vs-bot evaluation loops
  - measurable regression tracking

## Adapt Later
- Full multi-agent orchestration (researcher/planner/coder/qa personas) once core single-agent execution is stable.
- Advanced schema-driven telemetry and CI policy checks for agent outputs.
- Pluggable vector memory for enterprise-scale knowledge retrieval.

## Reject For Now
- Heavy framework migration that replaces existing Node/Express SAM9 core.
  Reason: current service already integrated and production-aware; migration risk > immediate value.
- Unbounded auto-action execution without approval gates.
  Reason: safety, financial, and operational risk.

## 5) Proposed SAM9 v2 Architecture

## Layer A: Conversation Brain
- Intent classes:
  - support_help
  - admin_report
  - project_management
  - technical_advice
  - execute_request
- Style policy:
  - human-like but transparent AI identity
  - concise by default, deep on request
  - empathy for support incidents

## Layer B: Tool Execution Router
- Tool contracts (strict input/output JSON):
  - analytics_query
  - report_generate
  - project_snapshot_write
  - runtime_control
  - recommendation_engine
- Every tool call logs:
  - requested_by
  - purpose
  - success/failure
  - latency
  - safe_error_code

## Layer C: Memory
- Short-term memory:
  - conversation thread context
  - unresolved asks
- Mid-term memory:
  - recent incidents
  - admin preferences
- Long-term memory:
  - strategy deltas
  - recurring support patterns
  - accepted/rejected recommendations

## Layer D: Knowledge And Guidance
- Repository-grounded guidance using existing VEX routes/settings.
- Product/support policy KB for accurate user guidance.
- No speculative answers when confidence is low; ask clarifying question or escalate.

## Layer E: Reporting
- Automatic reports:
  - daily support quality report
  - weekly SAM9 performance and fairness report
  - incident postmortem draft report
- Must include:
  - what happened
  - impact
  - likely cause
  - evidence
  - next actions

## 6) Human-Like Support Design (Without Deception)

Required behavior contract:
- Always self-identify as SAM9 AI when context requires identity clarity.
- Use natural language and adaptive phrasing, not canned repetitive templates.
- Ask focused follow-up questions (max 2 at a time).
- Summarize user issue before solution steps.
- Offer handoff when:
  - confidence low
  - high-risk domain (security/payments/account lock)
  - user explicitly requests human agent
- Pass structured handoff summary so user does not repeat everything.

## 7) Free Stack Strategy (Cost-First)

## Phase A (Near-zero cost, immediate)
- Keep current ai-service Node stack.
- Improve orchestration and memory logic in ai-service/src/sam9-core.mjs.
- Expand report synthesis in server/admin-routes/admin-ai-agent.ts.
- Add quality scoring jobs/scripts in scripts/.

## Phase B (Low cost)
- Add optional local/low-cost model adapters for classification and style refinement.
- Add compact vector memory backend only if retrieval quality needs it.

## Phase C (Scale)
- Add multi-agent role orchestration only after single-agent KPIs stabilize.

## 8) 30/60/90 Day Execution Roadmap

## Day 0-30 (Core Reliability + Style)
- Add thread-aware admin/support memory state.
- Add strict intent-to-tool routing with audit trail.
- Add response-style policy templates (support/admin/pm/dev).
- Add confidence calibration and escalation precision tuning.

Deliverables:
- memory + routing v1 in ai-service
- support realism prompts/policies
- admin report format v2

## Day 31-60 (Manager + Developer Modes)
- Project manager mode:
  - sprint plan drafts
  - risk register generation
  - release checklist suggestions
- Developer advisor mode:
  - repository-aware technical suggestions
  - impact/risk explanation for proposed changes

Deliverables:
- new admin chat intents + structured outputs
- PM/dev recommendation objects with confidence and evidence

## Day 61-90 (Evaluation + Automation)
- Add evaluation harness:
  - support conversation quality
  - escalation correctness
  - recommendation acceptance rate
- Add scheduled management reports.
- Add anomaly detection for win-rate/fallback spikes.

Deliverables:
- measurable QA pipeline for SAM9 behavior
- periodic executive reporting

## 9) Measurable KPIs

Support KPIs:
- First-response relevance >= 80%
- Escalation precision >= 85%
- Repeated-user-question rate <= 20%
- Resolution-without-human for low-risk tickets >= 60%

Admin/PM KPIs:
- Report usefulness score (admin feedback) >= 4/5
- Actionable recommendation ratio >= 70%
- False/confused recommendations <= 10%

Gameplay/Fairness KPIs:
- AI win-rate by mode remains inside target band
- Regression detection lead time < 24h

## 10) Immediate Next Engineering Tasks In This Repo

1. Enhance support conversation memory and handoff summaries:
- ai-service/src/sam9-core.mjs
- server/routes/support-chat/support-messages.ts

2. Add structured admin intents and response schemas (pm/dev/report):
- ai-service/src/sam9-core.mjs
- server/admin-routes/admin-ai-agent.ts
- client/src/pages/admin/admin-sam9.tsx

3. Add evaluation/smoke scripts for SAM9 quality:
- scripts/smoke-ai-admin.mjs
- new scripts/smoke-sam9-support-quality.ts

4. Add observability tags and latency/error metrics correlation:
- server/lib/ai-agent-client.ts
- ai-service/src/sam9-core.mjs

## 11) Safety And Trust Guardrails

- No user deception: SAM9 identity remains explicit.
- No financial/security decisions without strict policy checks.
- Sensitive data minimization and redaction by default.
- Human handoff preserved and fast for risky cases.
- Every auto-recommendation must include confidence + rationale.

## 12) Decision

Recommended path: evolve existing SAM9 implementation in-place with a staged architecture upgrade (memory + routing + PM/dev modes + evaluation), not a disruptive framework rewrite.
