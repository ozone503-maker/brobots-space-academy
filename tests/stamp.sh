#!/bin/sh
# Re-stamp the cache-busting version: replaces the old short hash in fight3d.html and every fight3d/*.js import.
# All modules MUST share one ?v= value or the browser loads a module twice (two copies of game state).
# Usage (after committing code): sh tests/stamp.sh <old> <new>
set -e; [ -n "$1" ] && [ -n "$2" ]
sed -i "s/$1/$2/g" fight3d.html fight3d/*.js
grep -c "v=$2" fight3d.html fight3d/*.js
