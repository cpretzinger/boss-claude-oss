#!/bin/bash

###############################################################################
# GRACEFUL SHUTDOWN SCRIPT
# Purpose: Terminate all background boss-claude agents with 10-minute timeout
# Features: Graceful SIGTERM first, then force kill after timeout
###############################################################################

set -e

TIMEOUT_SECONDS=600  # 10 minutes
POLL_INTERVAL=5      # Check every 5 seconds
LOG_FILE="/tmp/boss-claude-shutdown-$(date +%Y%m%d-%H%M%S).log"

echo "========================================" | tee "$LOG_FILE"
echo "GRACEFUL SHUTDOWN - $(date)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"

# Function to log with timestamp
log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to get all boss-claude related PIDs
get_boss_pids() {
    ps aux | grep -E "(boss-claude|bin/boss-claude)" | grep -v grep | grep -v "graceful-shutdown" | awk '{print $2}' || true
}

# Step 1: Identify all running processes
log "Step 1: Identifying all boss-claude processes..."
INITIAL_PIDS=$(get_boss_pids)

if [ -z "$INITIAL_PIDS" ]; then
    log "✅ No boss-claude processes found. System is clean."
    exit 0
fi

INITIAL_COUNT=$(echo "$INITIAL_PIDS" | wc -l | tr -d ' ')
log "Found $INITIAL_COUNT boss-claude processes:"
echo "$INITIAL_PIDS" | while read pid; do
    process_info=$(ps -p "$pid" -o pid,etime,command | tail -n 1)
    log "  PID $pid: $process_info"
done

# Step 2: Send SIGTERM to all processes
log ""
log "Step 2: Sending SIGTERM (graceful shutdown signal)..."
echo "$INITIAL_PIDS" | while read pid; do
    if kill -0 "$pid" 2>/dev/null; then
        log "  Sending SIGTERM to PID $pid"
        kill -TERM "$pid" 2>/dev/null || log "    Warning: Could not send SIGTERM to $pid"
    fi
done

# Step 3: Wait for graceful shutdown with timeout
log ""
log "Step 3: Waiting up to $TIMEOUT_SECONDS seconds for graceful shutdown..."
elapsed=0
completed_pids=""
remaining_pids="$INITIAL_PIDS"

while [ $elapsed -lt $TIMEOUT_SECONDS ]; do
    current_pids=$(get_boss_pids)

    if [ -z "$current_pids" ]; then
        log "✅ All processes terminated gracefully after $elapsed seconds"
        echo ""
        log "========================================"
        log "SHUTDOWN COMPLETE - ALL PROCESSES EXITED GRACEFULLY"
        log "========================================"
        log "Total processes shutdown: $INITIAL_COUNT"
        log "Graceful exits: $INITIAL_COUNT"
        log "Forced kills: 0"
        log "Time taken: ${elapsed}s / ${TIMEOUT_SECONDS}s"
        log "Log file: $LOG_FILE"
        exit 0
    fi

    # Calculate which processes have exited
    new_completed=$(comm -23 <(echo "$remaining_pids" | sort) <(echo "$current_pids" | sort))
    if [ -n "$new_completed" ]; then
        echo "$new_completed" | while read pid; do
            log "  ✅ PID $pid exited gracefully"
        done
        completed_pids="$completed_pids$new_completed"$'\n'
        remaining_pids="$current_pids"
    fi

    sleep $POLL_INTERVAL
    elapsed=$((elapsed + POLL_INTERVAL))

    # Progress update every 30 seconds
    if [ $((elapsed % 30)) -eq 0 ]; then
        remaining_count=$(echo "$current_pids" | wc -l | tr -d ' ')
        log "  Progress: ${elapsed}s elapsed, $remaining_count processes still running"
    fi
done

# Step 4: Force kill remaining processes
log ""
log "Step 4: Timeout reached. Force killing remaining processes..."
REMAINING_PIDS=$(get_boss_pids)

if [ -z "$REMAINING_PIDS" ]; then
    log "✅ All processes terminated during wait period"
    echo ""
    log "========================================"
    log "SHUTDOWN COMPLETE - ALL PROCESSES EXITED"
    log "========================================"
    exit 0
fi

killed_count=0
echo "$REMAINING_PIDS" | while read pid; do
    if kill -0 "$pid" 2>/dev/null; then
        log "  ⚠️  Sending SIGKILL to PID $pid"
        kill -9 "$pid" 2>/dev/null || log "    Warning: Could not kill $pid"
        killed_count=$((killed_count + 1))
    fi
done

# Wait a moment for kills to complete
sleep 2

# Final verification
FINAL_PIDS=$(get_boss_pids)
if [ -n "$FINAL_PIDS" ]; then
    log ""
    log "❌ WARNING: Some processes could not be terminated:"
    echo "$FINAL_PIDS" | while read pid; do
        log "  PID $pid still running"
    done
fi

# Summary
log ""
log "========================================"
log "SHUTDOWN COMPLETE"
log "========================================"

graceful_count=$(echo "$completed_pids" | grep -v '^$' | wc -l | tr -d ' ')
forced_count=$(echo "$REMAINING_PIDS" | wc -l | tr -d ' ')

log "Total processes found: $INITIAL_COUNT"
log "Graceful exits: $graceful_count"
log "Forced kills: $forced_count"
log "Time taken: ${elapsed}s / ${TIMEOUT_SECONDS}s"
log "Log file: $LOG_FILE"

if [ -z "$FINAL_PIDS" ]; then
    log "✅ All processes successfully terminated"
    exit 0
else
    log "⚠️  Some processes could not be terminated"
    exit 1
fi
