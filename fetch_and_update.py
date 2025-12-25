import json
import os
import sys
from pathlib import Path
from datetime import datetime
import subprocess

# Paths - use relative paths for GitHub Actions compatibility
SCRIPT_DIR = Path(__file__).parent.resolve()
BASE_DIR = SCRIPT_DIR
MESSAGES_DIR = BASE_DIR / "messages"
THREAD_FILE = MESSAGES_DIR / "thread_8335225369860838_messages.json"
USERS_FILE = MESSAGES_DIR / "users.txt"
REELS_DATA_JS = MESSAGES_DIR / "reels_data.js"
# Use system Python in GitHub Actions, local venv otherwise
PYTHON_BIN = sys.executable


def run_download_script():
    """Runs the existing download_dm.py script to fetch latest messages."""
    print("--- Fetching New Messages via instagrapi ---")
    # We run it with the specific thread ID
    cmd = [str(PYTHON_BIN), str(BASE_DIR / "download_dm.py"), "--thread-id", "8335225369860838"]
    subprocess.run(cmd, cwd=str(BASE_DIR))

def update_catalog():
    """Parses the thread JSON and updates reels_data.js."""
    print("--- Updating Catalog Database ---")
    
    if not THREAD_FILE.exists():
        print(f"Error: {THREAD_FILE} not found.")
        return

    # Load users mapping
    user_map = {}
    if USERS_FILE.exists():
        with open(USERS_FILE, 'r') as f:
            user_map = json.load(f)

    with open(THREAD_FILE, 'r') as f:
        data = json.load(f)
        messages = data.get("messages", [])

    reels = []
    for msg in messages:
        # Check if it's a reel based on keys produced by download_dm.py
        if msg.get("item_type") in ("clip", "reel_share", "xma_media_share") and msg.get("reel_url"):
            user_id = msg.get("user_id")
            user_name = user_map.get(user_id, f"User {user_id}")
            
            reels.append({
                "url": msg.get("reel_url"),
                "user": user_name,
                "timestamp": msg.get("timestamp")
            })

    # Sort descending
    reels.sort(key=lambda x: x['timestamp'], reverse=True)

    with open(REELS_DATA_JS, 'w') as f:
        f.write("const reelsData = ")
        json.dump(reels, f, indent=2)
        f.write(";")
    
    print(f"✓ Updated catalog with {len(reels)} reels.")

def build_bundle():
    """Runs the bundle script."""
    print("--- Generating Shareable Bundle ---")
    cmd = [str(PYTHON_BIN), str(MESSAGES_DIR / "create_bundle.py")]
    subprocess.run(cmd, cwd=str(MESSAGES_DIR))

if __name__ == "__main__":
    run_download_script()
    update_catalog()
    build_bundle()
    print("\n[SUCCESS] Catalog updated and bundle created!")
