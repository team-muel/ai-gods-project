---
description: "Generate TypeScript types from the scoped Supabase project using MCP and suggest where to save them"
name: "Supabase MCP Generate Types"
agent: "agent"
tools: [supabase/*]
---
Use the read-only Supabase MCP server configured for this workspace.

Requirements:
- Confirm the MCP connection works.
- Generate TypeScript types for the scoped Supabase project.
- Summarize the main schemas or tables reflected in the generated output.
- Suggest the most appropriate file path in this repository to save the generated types.
- Do not apply database changes.
