#!/bin/bash
# PreToolUse hook — logs tool invocations to .claude-progress
# Receives JSON on stdin: { "tool_name": "...", "tool_input": {...} }

PROGRESS_FILE="/workspace/.claude-progress"

# Read JSON from stdin
input=$(cat)

tool_name=$(echo "$input" | jq -r '.tool_name // empty')

# Skip if no tool name
if [ -z "$tool_name" ]; then
  exit 0
fi

# Extract a meaningful detail based on tool type
case "$tool_name" in
  Read|Write|Edit)
    detail=$(echo "$input" | jq -r '.tool_input.file_path // empty')
    ;;
  Grep)
    pattern=$(echo "$input" | jq -r '.tool_input.pattern // empty')
    glob=$(echo "$input" | jq -r '.tool_input.glob // empty')
    detail="pattern=${pattern}"
    if [ -n "$glob" ]; then
      detail="${detail}, glob=${glob}"
    fi
    ;;
  Glob)
    detail=$(echo "$input" | jq -r '.tool_input.pattern // empty')
    ;;
  Bash)
    detail=$(echo "$input" | jq -r '.tool_input.command // empty' | head -c 200)
    ;;
  *)
    detail=$(echo "$input" | jq -r '.tool_input | keys[0:2] | join(", ")' 2>/dev/null || echo "")
    ;;
esac

# Append tool event
echo "@@TOOL(\"${tool_name}\", \"${detail}\")" >> "$PROGRESS_FILE"

exit 0
