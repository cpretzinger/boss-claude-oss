#!/bin/bash
# Pre-commit hook: Block commits with real credentials
# Excludes: test files, documentation examples, validators

# Generic patterns to detect credentials (no actual values)
PATTERNS="ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{22,}|sk-[a-zA-Z0-9_-]{20,}|redis://[^[:space:]]+:[^[:space:]]+@|postgresql://[^[:space:]]+:[^[:space:]]+@"

# Search for patterns, excluding safe files and patterns
FOUND=$(grep -rn -E "$PATTERNS" lib/ config/ bin/ --include="*.js" --include="*.json" 2>/dev/null | \
  grep -v "check-secrets.sh" | \
  grep -v "\.test\.js:" | \
  grep -v "example:" | \
  grep -v "expected:" | \
  grep -v "Format:" | \
  grep -v "// " | \
  grep -v "password@host" | \
  grep -v "user:pass@host" | \
  grep -v "username:password@host")

if [ -n "$FOUND" ]; then
  echo "$FOUND"
  echo "❌ BLOCKED: Real credentials found! Remove before committing."
  exit 1
fi

echo "✅ No credentials detected"
exit 0
