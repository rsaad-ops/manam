#!/bin/bash
# Double-click to start UPSMRT Social Studio. Keep this window open while you use the app.
cd "$(dirname "$0")"
(sleep 1 && open "http://localhost:8787") &
exec python3 server.py
