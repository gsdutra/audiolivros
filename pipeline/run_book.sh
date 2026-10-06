#!/bin/zsh
# Long unattended render: keeps the Mac awake, restarts after a crash (the chunk cache makes it resumable).
# usage: pipeline/run_book.sh <voice>    (log: build/synth.log)
cd "${0:A:h}/.."
voice=${1:-voxtral-male}
for attempt in {1..20}; do
  echo "=== run $attempt $(date '+%F %T')"
  caffeinate -ims .venv/bin/python -u pipeline/synthesize.py "$voice" 2>&1 | grep --line-buffered -v -iE "warning|fetching|it/s\]"
  [[ ${pipestatus[1]} -eq 0 ]] && { echo "=== done $(date '+%F %T')"; exit 0; }
  sleep 30
done
