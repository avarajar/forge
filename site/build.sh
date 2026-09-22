#!/usr/bin/env bash
# Assembles the landing page into site/dist with the screenshots it uses.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist/screenshots
cp index.html styles.css main.js dist/
for shot in task-list task-list-light new-task task-detail session-states accounts command-palette mobile; do
  cp "../docs/screenshots/$shot.png" dist/screenshots/
done
echo "Built site/dist"
