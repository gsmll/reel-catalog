#!/usr/bin/env python3
"""
Instagram Group Chat Message Downloader
Downloads all messages from a specific DM thread using instagrapi.

Usage:
  python download_dm.py                    # Interactive mode (list all threads)
  python download_dm.py --thread-id 123    # Download specific thread by ID
  python download_dm.py --thread-url https://www.instagram.com/direct/t/123/
"""

import json
import os
import re
import sys
import argparse
import getpass
import time
import random
from pathlib import Path
from datetime import datetime
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, TwoFactorRequired

# Session file to avoid repeated logins
SESSION_FILE = "session.json"
OUTPUT_DIR = Path("messages")
OUTPUT_JSON = "messages.json"

# Default thread ID (user's group chat)
DEFAULT_THREAD_ID = "8335225369860838"


def parse_args():
    parser = argparse.ArgumentParser(description="Download Instagram DM messages")
    parser.add_argument("--thread-id", "-t", type=str, default=DEFAULT_THREAD_ID,
                        help=f"Thread ID to download (default: {DEFAULT_THREAD_ID})")
    parser.add_argument("--thread-url", "-u", type=str,
                        help="Instagram DM URL (e.g., https://www.instagram.com/direct/t/123/)")
    parser.add_argument("--interactive", "-i", action="store_true",
                        help="List all threads and choose interactively")
    return parser.parse_args()


def get_client():
    """Initialize and login to Instagram."""
    cl = Client()
    
    # Try to load existing session
    if os.path.exists(SESSION_FILE):
        try:
            cl.load_settings(SESSION_FILE)
            cl.login_by_sessionid(cl.sessionid)
            print("✓ Logged in using saved session")
            return cl
        except Exception as e:
            print(f"Session expired or invalid: {e}")
            os.remove(SESSION_FILE)
    
    # Fresh login
    username = input("Instagram Username: ")
    password = getpass.getpass("Instagram Password: ")
    
    try:
        cl.login(username, password)
    except TwoFactorRequired:
        code = input("Enter 2FA code: ")
        cl.login(username, password, verification_code=code)
    
    # Save session for next time
    cl.dump_settings(SESSION_FILE)
    print("✓ Logged in and session saved")
    return cl


def list_threads(cl):
    """List all DM threads and return them."""
    print("\nFetching your DM threads...")
    threads = cl.direct_threads(amount=50)
    
    print("\n" + "=" * 60)
    print("YOUR DM THREADS:")
    print("=" * 60)
    
    for i, thread in enumerate(threads):
        users = ", ".join([u.username for u in thread.users])
        thread_type = "GROUP" if thread.is_group else "DM"
        print(f"{i+1:3}. [{thread_type}] {thread.thread_title or users}")
    
    print("=" * 60)
    return threads


def save_messages(messages, thread_title, cursor=None):
    """Save messages and current cursor to JSON file."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    output_file = OUTPUT_DIR / f"{thread_title.replace(' ', '_')}_{OUTPUT_JSON}"
    
    data = {
        "thread_title": thread_title,
        "exported_at": datetime.now().isoformat(),
        "total_messages": len(messages),
        "last_cursor": cursor,
        "messages": messages
    }
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    return output_file


def load_existing_progress(thread_title):
    """Load existing messages and cursor if file exists."""
    output_file = OUTPUT_DIR / f"{thread_title.replace(' ', '_')}_{OUTPUT_JSON}"
    if output_file.exists():
        try:
            with open(output_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("messages", []), data.get("last_cursor")
        except Exception as e:
            print(f"⚠️ Could not load existing progress: {e}")
    return [], None
    

def process_single_message(msg):
    """Extracts relevant data from a raw Instagram message object."""
    msg_id = msg.get("item_id")
    timestamp_ms = msg.get("timestamp")
    timestamp = datetime.fromtimestamp(timestamp_ms / 1000000).isoformat() if timestamp_ms else None
    user_id = str(msg.get("user_id"))
    item_type = msg.get("item_type")
    text = msg.get("text")
    
    msg_data = {
        "id": msg_id,
        "timestamp": timestamp,
        "user_id": user_id,
        "item_type": item_type,
        "text": text,
    }
    
    # --- REEL / MEDIA EXTRACTION ---
    if item_type == "clip":
        # Instagram nests it as clip.clip.code and clip.clip.video_versions
        outer_clip = msg.get("clip", {})
        inner_clip = outer_clip.get("clip", {})
        
        msg_data["reel_code"] = inner_clip.get("code")
        
        # Get video URL
        video_versions = inner_clip.get("video_versions", [])
        if video_versions:
            msg_data["reel_url"] = video_versions[0].get("url")
        
        # Get Thumbnail
        candidates = inner_clip.get("image_versions2", {}).get("candidates", [])
        if candidates:
            # Prefer the mid-sized candidate (usually index 1 or 0) for grid
            thumb = candidates[1] if len(candidates) > 1 else candidates[0]
            msg_data["reel_thumbnail"] = thumb.get("url")

    elif item_type == "media":
        media = msg.get("media", {})
        if media:
            msg_data["media_url"] = media.get("video_url") or (media.get("image_versions2", {}).get("candidates", [{}])[0].get("url") if media.get("image_versions2") else None)
            if media.get("code") and not msg_data.get("media_url"):
                msg_data["media_url"] = f"https://www.instagram.com/p/{media.get('code')}/"

    elif item_type == "reel_share":
        reel_share = msg.get("reel_share", {})
        media = reel_share.get("media", {})
        if media:
            msg_data["reel_url"] = media.get("video_url")
            msg_data["reel_code"] = media.get("code")
            
            # Get Thumbnail
            candidates = media.get("image_versions2", {}).get("candidates", [])
            if candidates:
                thumb = candidates[1] if len(candidates) > 1 else candidates[0]
                msg_data["reel_thumbnail"] = thumb.get("url")
        
        if not msg_data.get("reel_url") and msg_data.get("reel_code"):
            msg_data["reel_url"] = f"https://www.instagram.com/reels/{msg_data['reel_code']}/"

    elif item_type == "xma_media_share":
        xmas = msg.get("xma_share", [])
        if isinstance(xmas, list) and xmas:
            target = xmas[0]
            msg_data["reel_url"] = target.get("target_url")
            msg_data["reel_thumbnail"] = target.get("preview_url") or target.get("preview_url_large")
            
        elif isinstance(xmas, dict):
            msg_data["reel_url"] = xmas.get("target_url")
            msg_data["reel_thumbnail"] = xmas.get("preview_url") or xmas.get("preview_url_large")
    
    # Final direct-link creation from code
    if msg_data.get("reel_code") and not msg_data.get("reel_url"):
        msg_data["reel_url"] = f"https://www.instagram.com/reels/{msg_data['reel_code']}/"
        
    return msg_data


def download_thread_messages(cl, thread_id, thread_title):
    """Download all messages from a thread with pagination and resume support."""
    
    all_messages, cursor = load_existing_progress(thread_title)
    
    if all_messages:
        print(f"✓ Resuming from existing file ({len(all_messages)} messages already saved)")
    
    print(f"\nDownloading messages from '{thread_title}'...")
    
    page = 1
    params = {
        "visual_message_return_type": "unseen",
        "direction": "older",
        "seq_id": "40065",
        "limit": "100", 
    }
    
    # --- NEW: Fetch most recent messages first to catch anything since last run ---
    print(f"  Checking for new messages...")
    recent_params = params.copy()
    recent_params.pop("cursor", None)
    
    try:
        result = cl.private_request(f"direct_v2/threads/{thread_id}/", params=recent_params)
        recent_items = result.get("thread", {}).get("items", [])
        
        existing_ids = {m.get("id") for m in all_messages}
        new_count = 0
        
        # We need to process these in reverse order (oldest of the new ones first) 
        # or just prepend them correctly. Prepending is easier for "new" ones.
        new_messages = []
        for msg in recent_items:
            msg_id = msg.get("item_id")
            if msg_id in existing_ids:
                break # We reached messages we already have
            
            # Process message data (borrowed logic from below)
            processed_msg = process_single_message(msg)
            new_messages.append(processed_msg)
            new_count += 1
            
        if new_messages:
            # New messages are in reverse chronological order from API (latest first)
            # We want to insert them at the beginning of all_messages
            all_messages = new_messages + all_messages
            print(f"  ✓ Added {new_count} new messages since last run.")
            save_messages(all_messages, thread_title, cursor) # Keep the old cursor for back-filling
        else:
            print(f"  ✓ No new messages found.")
            
    except Exception as e:
        print(f"  ⚠️ Error checking for new messages: {e}")

    # --- Continue with original older pagination if needed ---
    try:
        while True:
            if cursor:
                params["cursor"] = cursor
                
            print(f"  Fetching page {page} (Total: {len(all_messages)})...", end="\r")
            
            try:
                result = cl.private_request(f"direct_v2/threads/{thread_id}/", params=params)
                thread_data = result.get("thread", {})
                items = thread_data.get("items", [])
                
                if not items:
                    print("\n  Reached start of conversation or no more items found.")
                    break
                    
                existing_ids = {m.get("id") for m in all_messages}
                
                for msg in items:
                    msg_id = msg.get("item_id")
                    if msg_id in existing_ids:
                        continue
                        
                    msg_data = process_single_message(msg)
                    
                    # DEBUG: Save first clip raw message to debug file
                    if msg_data.get("item_type") == "clip" and not os.path.exists("debug_clip.json"):
                        with open("debug_clip.json", "w") as f:
                            json.dump(msg, f, indent=2, default=str)
                        print("\n[DEBUG] Saved raw clip message to debug_clip.json")
                    
                    all_messages.append(msg_data)
                    
                cursor = thread_data.get("oldest_cursor")
                save_messages(all_messages, thread_title, cursor)
                
                if not cursor:
                    print("\n  No more messages to fetch.")
                    break
                    
                page += 1
                time.sleep(0.5 + random.random())
                
            except Exception as e:
                print(f"\nError fetching page {page}: {e}")
                break
    except KeyboardInterrupt:
        print("\n\n🛑 Stopped by user. Progress saved.")
            
    return all_messages


def analyze_reels(messages):
    """Analyze and display reel statistics."""
    # Consider all types that might be reels
    reels = [m for m in messages if m.get("item_type") in ("clip", "reel_share", "xma_media_share")]
    
    if not reels:
        print("\nNo reels found in this chat.")
        return
    
    print(f"\n{'=' * 60}")
    print(f"REELS WRAPPED 🎬")
    print(f"{'=' * 60}")
    print(f"Total reels shared: {len(reels)}")
    
    user_counts = {}
    for reel in reels:
        uid = reel.get("user_id", "unknown")
        user_counts[uid] = user_counts.get(uid, 0) + 1
    
    print(f"\nReels by user:")
    for uid, count in sorted(user_counts.items(), key=lambda x: -x[1]):
        print(f"  User {uid}: {count} reels")
    
    print(f"\nReel Links (first 10):")
    valid_urls = [m.get("reel_url") for m in reels if m.get("reel_url")]
    for url in valid_urls[:10]:
        print(f"  • {url}")
    
    if len(valid_urls) == 0:
        print("  (Warning: Found reels but couldn't extract direct links. Check JSON for deeper data.)")


def main():
    args = parse_args()
    
    thread_id = args.thread_id
    if args.thread_url:
        match = re.search(r'/direct/t/(\d+)', args.thread_url)
        if match:
            thread_id = match.group(1)
    
    print("=" * 60)
    print("INSTAGRAM GROUP CHAT DOWNLOADER")
    print("=" * 60)
    
    try:
        cl = get_client()
        
        if args.interactive:
            threads = list_threads(cl)
            choice = input("\nEnter thread number: ")
            idx = int(choice) - 1
            thread = threads[idx]
            thread_id = thread.id
            thread_title = thread.thread_title or f"thread_{thread.id}"
        else:
            thread_title = f"thread_{thread_id}"
        
        messages = download_thread_messages(cl, thread_id, thread_title)
        output_file = OUTPUT_DIR / f"{thread_title.replace(' ', '_')}_{OUTPUT_JSON}"
        
        analyze_reels(messages)
        print(f"\n✓ Done! Data saved to {output_file}")
        
    except LoginRequired:
        print("❌ Login failed")
        if os.path.exists(SESSION_FILE):
            os.remove(SESSION_FILE)
    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    main()
