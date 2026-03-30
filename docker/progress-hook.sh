#!/bin/bash
# PreToolUse hook — logs tool invocations to .claude-progress
# Receives JSON on stdin: { "tool_name": "...", "tool_input": {...} }

PROGRESS_FILE="/workspace/.claude-progress"

# Read and parse JSON from stdin in a single jq call
input=$(cat)
if ! echo "$input" | jq empty 2>/dev/null; then
  exit 0
fi

eval "$(echo "$input" | jq -r '
  @sh "tool_name=\(.tool_name // "")",
  @sh "file_path=\(.tool_input.file_path // "")",
  @sh "pattern=\(.tool_input.pattern // "")",
  @sh "glob_pat=\(.tool_input.glob // "")",
  @sh "command=\(.tool_input.command // "")"
')"

# Skip if no tool name
if [ -z "$tool_name" ]; then
  exit 0
fi

# Extract a meaningful detail based on tool type
case "$tool_name" in
  Read|Write|Edit)
    detail="$file_path"
    ;;
  Grep)
    detail="pattern=${pattern}"
    if [ -n "$glob_pat" ]; then
      detail="${detail}, glob=${glob_pat}"
    fi
    ;;
  Glob)
    detail="$pattern"
    ;;
  Bash)
    detail=$(printf '%.200s' "$command")
    ;;
  *)
    detail=""
    ;;
esac

# Append tool event (using printf to avoid shell expansion issues)
printf '@@TOOL("%s", "%s")\n' "$tool_name" "$detail" >> "$PROGRESS_FILE"

exit 0
