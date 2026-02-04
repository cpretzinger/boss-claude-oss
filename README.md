# Boss Claude

**Transform Claude into a persistent, leveling AI that remembers everything across every project.**

Boss Claude turns every coding session into an RPG-style experience where Claude levels up, earns rewards, and maintains perfect memory across all your repositories. No more re-explaining. No more lost context. Just pure productivity.

[![Skool Community](https://img.shields.io/badge/Skool-Join%20Community-blue?style=flat-square)](https://www.skool.com/boss-claude/about)

> **For developers who refuse to repeat themselves.** Stop losing context. Stop re-explaining your codebase. Ship faster with an AI that actually remembers.

## Why Boss Claude?

### The Problem
Every time you start a new Claude session, you're starting from zero. You explain your architecture again. You point to the same files again. You waste time bringing Claude up to speed - again.

### The Solution
Boss Claude gives Claude **persistent memory** across every repository you work on. It automatically saves every session, learns your patterns, and recalls past conversations instantly. Plus, it makes the entire experience fun with RPG-style leveling and rewards.

## What You Get

- **Never Repeat Yourself**: Claude remembers every conversation across all your projects
- **Instant Context Recall**: Search past sessions with natural language queries
- **Smart Delegation**: Claude automatically routes work to specialized agents for maximum efficiency
- **RPG Progression**: Watch Claude level up, earn XP, and build a token bank as you work
- **Global Memory**: Works in ANY repository with a single `npm install -g`
- **Real-time Monitoring**: Watch agent activity in a companion window
- **Career Stats**: Track total sessions, repos managed, and productivity metrics

## Installation

```bash
npm install -g @cpretzinger/boss-claude
```

### What Happens on Install

When you install Boss Claude, it automatically:

1. **Creates `~/.boss-claude/`** - Secure configuration directory for your credentials
2. **Auto-detects credentials** - Imports from environment or existing configs
3. **Configures Claude** - Injects "Conductor Mode" into `~/.claude/CLAUDE.md`

After installation, Claude becomes **the Conductor** - an orchestrator who delegates work to specialized agents instead of doing everything directly. This makes Claude dramatically more efficient.

## Setup

### 1. Configure Credentials

Edit `~/.boss-claude/.env` with your credentials:

```bash
# Redis URL (required) - For Boss identity and session storage
REDIS_URL=redis://default:password@host:port

# GitHub Token (required) - For memory storage in GitHub Issues
# Create at: https://github.com/settings/tokens (needs 'repo' scope)
GITHUB_TOKEN=ghp_your_token_here

# GitHub Owner (optional) - Defaults to 'your-github-username'
GITHUB_OWNER=your-github-username

# GitHub Memory Repository (optional) - Defaults to 'boss-claude-memory'
GITHUB_MEMORY_REPO=boss-claude-memory
```

### 2. GitHub Memory Repository (Auto-Created)

The `boss-claude setup` command automatically creates a private `boss-claude-memory` repository for you.

If auto-creation fails, create it manually:
```bash
gh repo create boss-claude-memory --private
```

### 3. Initialize Boss Claude

```bash
boss-claude init
```

## Usage

Boss Claude automatically loads when Claude starts in ANY repository. You'll see your level, XP progress, and repository stats right at the start of every session.

### Essential Commands

#### Show Status
```bash
boss-claude status
```

See your Boss level, XP progress, token bank, and repository stats.

#### Save Session
```bash
boss-claude save "Implemented user authentication"
boss-claude save "Fixed bug in API" --tags "bugfix,api"
```

Saves your current session to memory with automatic rewards. Boss Claude will auto-generate a summary if you don't provide one.

#### Recall Past Sessions
```bash
boss-claude recall "authentication"
boss-claude recall "bug fix" --limit 10
```

Search your entire history with natural language. Find that conversation from 3 months ago instantly.

#### Watch Agent Activity
```bash
boss-claude watch
```

Opens a real-time monitor showing all agent activity. Perfect for:
- Debugging multi-agent workflows
- Monitoring task execution
- Tracking automation progress

Run `boss-claude watch --help` for all options.

#### Live Agent Commentary
```bash
boss-claude commentate
```

Get a real-time play-by-play of what agents are doing - reads, writes, executions.

## How It Works

### The Conductor Model

Boss Claude transforms Claude into **the Conductor** - an orchestrator who delegates work instead of doing everything directly. When you ask Claude to do something:

1. **Claude analyzes your request** and determines the best approach
2. **Specialized agents are spawned** to handle specific tasks (search, implementation, testing, etc.)
3. **Agents work in parallel** when possible for maximum speed
4. **Results are synthesized** and reported back to you
5. **Everything is tracked** for rewards and memory

This approach makes Claude dramatically more efficient because:
- Multiple agents can work simultaneously
- Each agent is optimized for its specific task
- Claude focuses on orchestration, not execution
- You get better results faster

### Session Flow

Every time you work with Boss Claude:

1. **Auto-Load**: Your Boss identity loads automatically with stats
2. **Session Tracking**: All work is monitored and tracked
3. **Memory Capture**: When you save, the session becomes searchable forever
4. **Rewards**: Earn XP and bank tokens based on your session
5. **Level Up**: Reach new levels and unlock achievements

### Data Storage

- **Redis**: Boss identity, session state, repository stats (fast, real-time)
- **GitHub Issues**: Long-term memory storage (searchable, permanent)
- **Local**: Secure configuration in `~/.boss-claude/.env`

## The Gamification System

### Leveling Up

Boss Claude uses an RPG-style progression system. As you work, you:
- **Earn XP** for completing sessions
- **Bank tokens** from your work
- **Level up** and track your career stats
- **Track efficiency** and improve over time

Higher levels mean more experience with your codebase and better AI performance.

### Rewards System

Every saved session earns you:
- **Base XP** for completing the session
- **Efficiency Bonus** when Claude delegates work effectively
- **Token Banking** - all tokens used are added to your bank
- **Net Worth Calculation** - see your total value in dollars

The more you use Boss Claude efficiently, the faster you level up.

### Stats Tracked

- Total sessions across all repositories
- Number of repositories managed
- Token bank size and net worth
- Current level and XP progress
- Per-repository session counts
- Delegation efficiency metrics

## Memory System

Boss Claude saves every session as a GitHub Issue in your private memory repository. Each session includes:

```markdown
## Session Summary
Implemented user authentication

## Session Data
Full conversation history, file changes, commands executed, and context

Labels: session, repository-name, feature-tags
```

This means:
- **Perfect recall** - Search any past conversation instantly
- **Cross-project memory** - Reference work from other repositories
- **Never lose context** - Everything is preserved forever
- **Semantic search** - Find sessions by topic, not just keywords

## Agent Hierarchy

Boss Claude implements a sophisticated agent hierarchy:

```
                    🎼 CONDUCTOR (Claude)
                    Orchestrates & Delegates
                            |
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
    🔍 Explore           🛠️ Builder          ⚙️ Executor
    Search & Read       Create & Fix       Test & Deploy
```

### The Conductor Advantage

Instead of Claude trying to do everything itself, it becomes a conductor who:
- **Analyzes** your request and breaks it into tasks
- **Delegates** to specialized agents optimally
- **Coordinates** parallel work for speed
- **Synthesizes** results into clear reports
- **Ensures quality** through oversight

This makes your sessions faster, more reliable, and more efficient.

### Safety & Boundaries

All agents operate within strict boundaries:
- **Repository isolation** - Agents only modify the current repository
- **Validation gates** - All work is reviewed before completion
- **Hierarchy enforcement** - Clear chain of command and responsibility
- **Violation tracking** - Any boundary issues are logged and reviewed

## CLI Reference

```bash
# Initialize Boss Claude in current repo
boss-claude init

# Show Boss status and stats
boss-claude status

# Save current session
boss-claude save [summary] [--tags <tags>]

# Search past sessions
boss-claude recall <query> [--limit <number>]

# Watch agent activity in real-time
boss-claude watch

# Live agent commentary
boss-claude commentate

# Run integration tests
boss-claude test

# Show help
boss-claude --help
```

## Performance

Boss Claude is optimized for speed:
- **Sub-second status checks** - Instant feedback on your progress
- **Parallel agent execution** - Multiple tasks run simultaneously
- **Redis caching** - Lightning-fast recall of recent sessions
- **Efficient delegation** - Minimal orchestration overhead

Run `npm run benchmark:memory` to see performance metrics on your system.

## Testing

Boss Claude includes comprehensive integration tests:

```bash
boss-claude test
```

Validates:
- Redis connectivity and operations
- PostgreSQL database and schema
- GitHub API integration
- Full system end-to-end workflow

Tests run in 3-5 seconds and validate all components without affecting production data.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | Yes | - | Redis connection string |
| `GITHUB_TOKEN` | Yes | - | GitHub personal access token |
| `GITHUB_OWNER` | No | `your-github-username` | GitHub username |
| `GITHUB_MEMORY_REPO` | No | `boss-claude-memory` | Repository name for memory storage |

## Troubleshooting

### "REDIS_URL not found"
Edit `~/.boss-claude/.env` and add your Redis connection string.

### "GITHUB_TOKEN not found"
Create a GitHub token at https://github.com/settings/tokens with `repo` scope and add to `~/.boss-claude/.env`.

### "Not in a git repository"
Boss Claude requires a git repository to track sessions. Initialize one with `git init`.

### Auto-load not working
Check that `~/.claude/CLAUDE.md` contains the Boss Claude configuration. Reinstall with:
```bash
npm uninstall -g @cpretzinger/boss-claude
npm install -g @cpretzinger/boss-claude
```

### Need Help?
Join our [Skool Community](https://www.skool.com/boss-claude/about) for support, tips, and community discussion.

## Development

```bash
# Clone the repo
git clone https://github.com/cpretzinger/boss-claude-oss.git
cd boss-claude-oss

# Install dependencies
npm install

# Link globally for testing
npm link

# Test in any repo
boss-claude init
```

## What Makes Boss Claude Different?

### Other AI Tools
- Start from zero every session
- No cross-project memory
- Manual context management
- Single-threaded execution

### Boss Claude
- Persistent memory across all projects
- Instant recall of any past conversation
- Automatic context preservation
- Parallel agent execution for speed
- RPG-style progression that makes coding fun
- Smart delegation for maximum efficiency

## Changelog

### 1.1.1
- Fix: Commentator now event-driven, reports after agent actions
- Fix: `boss-claude status` no longer hangs
- Fix: Proper Redis connection cleanup

### 1.1.0
- Security hardening + CLI fixes

### 1.0.0
- Initial release

## License

MIT

## Author

Craig Pretzinger ([@cpretzinger](https://github.com/cpretzinger))

## Community

Join the [Boss Claude Community on Skool](https://www.skool.com/boss-claude/about) to:
- Get help with setup and troubleshooting
- Share tips and workflows
- Request features and improvements
- Connect with other users

---

**Built with**: Node.js, Redis, GitHub API, Commander.js, Chalk

**Ready to 10x your coding efficiency?** Install Boss Claude and never repeat yourself again.
