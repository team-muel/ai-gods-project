---
description: "Plan and perform a scoped Supabase MCP write operation for this workspace with explicit safety checks"
name: "Supabase MCP Write Safe"
agent: "agent"
tools: [supabaseWrite/*]
argument-hint: "Describe the schema change, migration, or write task"
---
Use the write-capable Supabase MCP server configured for this workspace.

Requirements:
- First restate the requested change as a short execution plan.
- Confirm the project scope is this workspace's Supabase project before mutating anything.
- Prefer `apply_migration` for schema changes.
- Use `execute_sql` for narrow validation queries before and after the change.
- Avoid destructive operations unless they are explicitly requested and necessary.
- If the requested change is risky, explain the risk and propose the safest alternative before proceeding.
- End with a concise report covering:
  1. What changed
  2. What was validated
  3. Any follow-up actions still needed
