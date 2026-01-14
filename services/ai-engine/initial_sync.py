"""
Initial Log Sync Script
========================
Script khusus untuk PERTAMA KALI import messages.log ke ChromaDB.
Langsung bulk insert tanpa HTTP overhead - jauh lebih cepat!

Usage:
    python initial_sync.py [--reset] [--batch-size 500]
    
Options:
    --reset         Clear semua data dan sync dari awal
    --batch-size    Jumlah entries per batch (default: 500)
    --limit         Limit total entries (untuk testing)
"""

import os
import sys
import re
import json
import time
import argparse
from datetime import datetime
from pathlib import Path

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from services.rag import RAGService

# ============================================
# Configuration
# ============================================

LOG_FILE = os.path.join(os.path.dirname(__file__), '../discord-bot/messages.log')
CHECKPOINT_FILE = os.path.join(os.path.dirname(__file__), 'data/initial_sync_checkpoint.json')
BATCH_SIZE = 500  # Process 500 entries at a time

# ============================================
# Helper Functions
# ============================================

def load_checkpoint():
    """Load sync checkpoint"""
    try:
        if os.path.exists(CHECKPOINT_FILE):
            with open(CHECKPOINT_FILE, 'r') as f:
                return json.load(f)
    except:
        pass
    return {"last_line": 0, "imported": 0, "started_at": None}

def save_checkpoint(checkpoint):
    """Save sync checkpoint"""
    os.makedirs(os.path.dirname(CHECKPOINT_FILE), exist_ok=True)
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(checkpoint, f, indent=2)

def parse_log_line(line: str) -> dict | None:
    """
    Parse a single log line into structured data.
    Returns None if line is not a valid conversation entry.
    """
    line = line.strip()
    if not line:
        return None
    
    # Skip "Added to conversation log" lines
    if "Added to conversation log" in line:
        return None
    
    try:
        # Format 1: Pure JSON format (cleaned by clean-logs-v2.js)
        # {"timestamp":"2024-07-26T15:06:28.593Z","server":"...","user":"...","username":"...","query":"...","reply":"...","provider":"..."}
        if line.startswith('{') and line.endswith('}'):
            data = json.loads(line)
            if 'query' in data and 'reply' in data and 'user' in data:
                return {
                    "content": f"User {data.get('username', 'unknown')} asked: {data['query']}\nBot replied: {data['reply']}",
                    "metadata": {
                        "server": str(data.get('server', 'unknown')),
                        "user": str(data.get('user', 'unknown')),
                        "username": data.get('username', 'unknown'),
                        "timestamp": data.get('timestamp'),
                        "provider": data.get('provider', 'unknown'),
                        "source": "initial_sync"
                    }
                }
        
        # Format 2: JSON with timestamp prefix (old format from clean-logs-v2.js)
        # 2024-07-26T15:06:28.593Z - {"timestamp":"...","server":"...","user":"...","username":"...","query":"...","reply":"...","provider":"..."}
        json_match = re.match(r'^([\d\-T:.Z]+) - ({.*})$', line)
        if json_match:
            data = json.loads(json_match.group(2))
            if 'query' in data and 'reply' in data and 'user' in data:
                return {
                    "content": f"User {data.get('username', 'unknown')} asked: {data['query']}\nBot replied: {data['reply']}",
                    "metadata": {
                        "server": str(data.get('server', 'unknown')),
                        "user": str(data.get('user', 'unknown')),
                        "username": data.get('username', 'unknown'),
                        "timestamp": data.get('timestamp'),
                        "provider": data.get('provider', 'unknown'),
                        "source": "initial_sync"
                    }
                }
        
        # Format 2: Old format with escaped newlines
        # 2024-07-26T15:06:28.594Z - "[User: @username],\n [Query: ...],\n [reply: ...]\n\n"
        old_match = re.match(
            r'^([\d\-T:.Z]+) - "\[User: @?([^\]]+)\],\\n \[Query: (.*?)\],\\n \[reply: (.*?)\](?:\\n)*"?$',
            line,
            re.DOTALL
        )
        if old_match:
            timestamp, username, query, reply = old_match.groups()
            # Clean up escaped characters
            query = query.replace('\\n', '\n').strip()
            reply = reply.replace('\\n', '\n').strip()
            
            # Skip if query or reply is too short/empty
            if len(query) < 2 or len(reply) < 2:
                return None
            
            return {
                "content": f"User {username} asked: {query}\nBot replied: {reply}",
                "metadata": {
                    "server": "unknown",
                    "user": "unknown",
                    "username": username,
                    "timestamp": timestamp,
                    "provider": "legacy",
                    "source": "initial_sync"
                }
            }
        
        # Format 3: Old format with Google results (more complex)
        google_match = re.match(
            r'^([\d\-T:.Z]+) - "\[User: @?([^\]]+)\],\\n \[Query: (.*?)\],\\n \[Google result: .*?\],\\n \[reply: (.*?)\]',
            line,
            re.DOTALL
        )
        if google_match:
            timestamp, username, query, reply = google_match.groups()
            query = query.replace('\\n', '\n').strip()
            reply = reply.replace('\\n', '\n').strip()
            
            if len(query) < 2 or len(reply) < 2:
                return None
            
            return {
                "content": f"User {username} asked: {query}\nBot replied: {reply}",
                "metadata": {
                    "server": "unknown",
                    "user": "unknown",
                    "username": username,
                    "timestamp": timestamp,
                    "provider": "legacy_google",
                    "source": "initial_sync"
                }
            }
    
    except Exception as e:
        pass
    
    return None

def print_progress(current, total, imported, skipped, start_time):
    """Print progress bar"""
    elapsed = time.time() - start_time
    percent = (current / total) * 100 if total > 0 else 0
    rate = current / elapsed if elapsed > 0 else 0
    eta = (total - current) / rate if rate > 0 else 0
    
    bar_length = 40
    filled = int(bar_length * current / total) if total > 0 else 0
    bar = '█' * filled + '░' * (bar_length - filled)
    
    sys.stdout.write(f'\r[{bar}] {percent:.1f}% | {current:,}/{total:,} | ✓{imported:,} ✗{skipped:,} | {rate:.0f}/s | ETA: {eta:.0f}s    ')
    sys.stdout.flush()

# ============================================
# Main Sync Function
# ============================================

def run_initial_sync(reset=False, batch_size=BATCH_SIZE, limit=None):
    """
    Run initial sync of messages.log to ChromaDB.
    Direct bulk insert - no HTTP overhead!
    Uses batch embedding for maximum speed.
    """
    print("=" * 60)
    print("  Ezra AI - Initial Log Sync")
    print("=" * 60)
    print()
    
    # Check log file
    if not os.path.exists(LOG_FILE):
        print(f"❌ Log file not found: {LOG_FILE}")
        return False
    
    # Get total lines
    print("📊 Counting total lines...")
    with open(LOG_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        total_lines = sum(1 for _ in f)
    print(f"   Total lines: {total_lines:,}")
    
    # Initialize RAG service with FAST MODE (lightweight 80MB model)
    print("\n📦 Initializing ChromaDB (fast mode)...")
    rag = RAGService(fast_mode=True)  # Use lightweight model!
    
    if reset:
        print("   ⚠️  Resetting database (--reset flag)")
        rag.clear_all()
        save_checkpoint({"last_line": 0, "imported": 0, "started_at": None})
    
    initial_count = rag.get_document_count()
    print(f"   Current documents: {initial_count:,}")
    
    # Load checkpoint
    checkpoint = load_checkpoint()
    start_line = checkpoint.get("last_line", 0)
    total_imported = checkpoint.get("imported", 0)
    
    if start_line > 0:
        print(f"\n🔄 Resuming from line {start_line:,} (previously imported: {total_imported:,})")
    else:
        checkpoint["started_at"] = datetime.now().isoformat()
    
    # Start sync
    print(f"\n🚀 Starting sync (batch size: {batch_size}, using batch embedding)...")
    print()
    
    start_time = time.time()
    current_line = 0
    imported = 0
    skipped = 0
    batch = []
    
    try:
        with open(LOG_FILE, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                current_line += 1
                
                # Skip already processed lines
                if current_line <= start_line:
                    continue
                
                # Check limit
                if limit and imported >= limit:
                    print(f"\n\n⚠️  Reached limit of {limit} entries")
                    break
                
                # Parse line
                parsed = parse_log_line(line)
                if parsed:
                    batch.append(parsed)
                else:
                    skipped += 1
                
                # Process batch when full - USE BATCH EMBEDDING!
                if len(batch) >= batch_size:
                    # Bulk add with batch embedding (MUCH faster)
                    added = rag.add_documents_batch(batch)
                    imported += added
                    
                    # Update checkpoint
                    checkpoint["last_line"] = current_line
                    checkpoint["imported"] = total_imported + imported
                    save_checkpoint(checkpoint)
                    
                    batch = []
                    
                    # Update progress
                    print_progress(current_line, total_lines, imported, skipped, start_time)
        
        # Process remaining batch
        if batch:
            added = rag.add_documents_batch(batch)
            imported += added
        
        # Final checkpoint
        checkpoint["last_line"] = current_line
        checkpoint["imported"] = total_imported + imported
        checkpoint["completed_at"] = datetime.now().isoformat()
        save_checkpoint(checkpoint)
        
        # Final progress
        print_progress(current_line, total_lines, imported, skipped, start_time)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted! Progress saved. Run again to continue.")
        checkpoint["last_line"] = current_line
        checkpoint["imported"] = total_imported + imported
        save_checkpoint(checkpoint)
        return False
    
    # Summary
    elapsed = time.time() - start_time
    final_count = rag.get_document_count()
    
    print("\n\n" + "=" * 60)
    print("  Sync Complete!")
    print("=" * 60)
    print(f"""
  📊 Results:
     - Lines processed: {current_line:,}
     - Entries imported: {imported:,}
     - Entries skipped:  {skipped:,}
     - Total documents:  {final_count:,}
     
  ⏱️  Time: {elapsed:.1f} seconds ({imported/elapsed:.0f} entries/sec)
  
  ✅ Initial sync complete! 
     The AI Engine now has context from {final_count:,} conversations.
""")
    
    return True

# ============================================
# Main Entry Point
# ============================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initial sync of messages.log to ChromaDB")
    parser.add_argument("--reset", action="store_true", help="Clear all data and sync from scratch")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help=f"Entries per batch (default: {BATCH_SIZE})")
    parser.add_argument("--limit", type=int, help="Limit total entries (for testing)")
    
    args = parser.parse_args()
    
    success = run_initial_sync(
        reset=args.reset,
        batch_size=args.batch_size,
        limit=args.limit
    )
    
    sys.exit(0 if success else 1)
