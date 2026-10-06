#!/bin/zsh
# Commit whatever chapters publish.py has written to app/ and push; the Pages workflow deploys it.
# usage: pipeline/deploy.sh ["message"]
cd "${0:A:h}/.."
git add app
if git diff --cached --quiet; then echo "nothing new to deploy"; exit 0; fi
n=$(ls app/library/*/[0-9][0-9]-*.enc 2>/dev/null | wc -l | tr -d ' ')
git commit -q -m "${1:-Publish chapters ($n of 20 ready)}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -q origin main && echo "pushed: $n chapters; Pages deploys in ~1 min"
