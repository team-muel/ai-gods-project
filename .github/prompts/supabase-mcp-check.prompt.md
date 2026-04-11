---
description: "Verify the workspace Supabase MCP connection and safely inspect the scoped project"
name: "Supabase MCP Check"
agent: "agent"
tools: [supabase/*]
---
Use the configured Supabase MCP server for this workspace to verify that the connection works and that the project scope is correct.

Requirements:
- Use only the read-only Supabase MCP server configured for this workspace.
- First verify connectivity with a safe read operation such as listing tables, listing migrations, or getting project development info.
- Confirm that the visible project scope matches this workspace's Supabase project.
- Inspect the database with focus on the app's main areas: debates, debate_messages, god_memories, memory_links, neuro_logs, arousal_logs, immune_logs.
- Summarize the result in this order:
  1. Whether the MCP connection works
  2. Which project or scope is visible
  3. What tables or resources are available
  4. Any blockers, auth issues, or permission problems
- Do not run write operations, migrations, or destructive SQL.

If the connection works, finish by suggesting the next safe MCP question to ask for this project.