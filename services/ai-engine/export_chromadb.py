"""
ChromaDB to Cloud RAG Migration Script
Exports conversation history for use with Gemini-based RAG
"""

import chromadb
import json
import os
from datetime import datetime

# Paths
CHROMADB_PATH = os.path.join(os.path.dirname(__file__), "data/chromadb")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../discord-bot/data/conversations")

def export_chromadb():
    """Export all documents from ChromaDB to JSON files per user"""
    
    print("=" * 60)
    print("  ChromaDB -> Cloud RAG Migration")
    print("=" * 60)
    
    # Connect to ChromaDB
    client = chromadb.PersistentClient(path=CHROMADB_PATH)
    collection = client.get_collection("discord_conversations")
    
    total = collection.count()
    print(f"\n[INFO] Total documents: {total:,}")
    
    # Get all documents
    print(f"[INFO] Loading documents...")
    result = collection.get(
        include=["documents", "metadatas"]
    )
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Group by user
    user_conversations = {}
    
    for i, (doc_id, content, metadata) in enumerate(zip(
        result['ids'], 
        result['documents'], 
        result['metadatas']
    )):
        user = metadata.get('user', 'unknown')
        
        if user not in user_conversations:
            user_conversations[user] = []
        
        user_conversations[user].append({
            'id': doc_id,
            'content': content,
            'username': metadata.get('username', 'unknown'),
            'server': metadata.get('server', 'unknown'),
            'timestamp': metadata.get('timestamp', ''),
            'provider': metadata.get('provider', 'unknown'),
            'source': metadata.get('source', 'chromadb')
        })
        
        if (i + 1) % 5000 == 0:
            print(f"   Processed {i + 1:,} / {total:,}")
    
    print(f"\n[INFO] Unique users: {len(user_conversations)}")
    
    # Save per-user files
    for user_id, conversations in user_conversations.items():
        filename = f"user_{user_id}.json"
        filepath = os.path.join(OUTPUT_DIR, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump({
                'user_id': user_id,
                'total_conversations': len(conversations),
                'exported_at': datetime.now().isoformat(),
                'conversations': conversations
            }, f, ensure_ascii=False, indent=2)
    
    # Save all conversations (for RAG indexing)
    all_conversations = []
    for conversations in user_conversations.values():
        all_conversations.extend(conversations)
    
    all_filepath = os.path.join(OUTPUT_DIR, "all_conversations.json")
    with open(all_filepath, 'w', encoding='utf-8') as f:
        json.dump({
            'total': len(all_conversations),
            'exported_at': datetime.now().isoformat(),
            'conversations': all_conversations
        }, f, ensure_ascii=False)
    
    print(f"\n[OK] Export complete!")
    print(f"   Output: {OUTPUT_DIR}")
    print(f"   Files: {len(user_conversations)} user files + all_conversations.json")
    print(f"   Total: {len(all_conversations):,} conversations")
    
    return all_conversations

if __name__ == "__main__":
    export_chromadb()
