"""
ChromaDB Viewer dengan Renumics Spotlight
Visualisasi embedding dan data conversations

Usage:
    python view_chromadb.py
"""

import os
import sys
import pandas as pd
import numpy as np

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def main():
    print("=" * 60)
    print("  ChromaDB Viewer - Renumics Spotlight")
    print("=" * 60)
    print()
    
    # Import ChromaDB
    import chromadb
    
    # Use absolute path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(script_dir, "data", "chromadb")
    print(f"📂 Loading ChromaDB from: {db_path}")
    
    if not os.path.exists(db_path):
        print(f"❌ ChromaDB path not found! Run initial_sync.py first.")
        return
    
    client = chromadb.PersistentClient(path=db_path)
    
    # List collections
    collections = client.list_collections()
    print(f"📋 Available collections: {[c.name for c in collections]}")
    
    if not collections:
        print("❌ No collections found!")
        return
    
    collection = client.get_collection("discord_conversations")
    
    total_docs = collection.count()
    print(f"📊 Total documents: {total_docs:,}")
    
    if total_docs == 0:
        print("❌ No documents found!")
        return
    
    # Get all data (limit untuk performa)
    limit = min(total_docs, 9999000)  # Max 5000 untuk visualisasi smooth
    print(f"📥 Loading {limit:,} documents...")
    
    results = collection.get(
        limit=limit,
        include=["documents", "metadatas", "embeddings"]
    )
    
    # Build DataFrame
    print("🔧 Building DataFrame...")
    
    data = []
    has_embeddings = results["embeddings"] is not None and len(results["embeddings"]) > 0
    
    for i in range(len(results["ids"])):
        content = results["documents"][i] if results["documents"] else ""
        
        # Parse content into prompt and response
        prompt = ""
        response = ""
        if "Bot replied:" in content:
            parts = content.split("Bot replied:", 1)
            prompt = parts[0].replace("User ", "").replace(" asked:", "").strip()
            # Remove username from prompt if present
            if prompt.startswith("ezrabrilliant "):
                prompt = prompt[14:]
            elif " asked: " in parts[0]:
                prompt = parts[0].split(" asked: ", 1)[1].strip() if " asked: " in parts[0] else prompt
            response = parts[1].strip() if len(parts) > 1 else ""
        else:
            prompt = content
        
        row = {
            "id": results["ids"][i],
            "content": content,
            "prompt": prompt,
            "response": response,
            # Numeric columns for scatter plot/histogram
            "content_length": len(content),
            "prompt_length": len(prompt),
            "response_length": len(response),
            "prompt_words": len(prompt.split()),
            "response_words": len(response.split()),
        }
        
        # Add embedding if available
        if has_embeddings:
            emb = np.array(results["embeddings"][i], dtype=np.float32)
            row["embedding"] = emb
            # Add embedding stats for scatter plot
            row["emb_mean"] = float(np.mean(emb))
            row["emb_std"] = float(np.std(emb))
        
        # Add metadata fields
        if results["metadatas"] and results["metadatas"][i]:
            meta = results["metadatas"][i]
            row["username"] = meta.get("username", "unknown")
            row["server"] = meta.get("server", "unknown")
            row["timestamp"] = meta.get("timestamp", "")
            row["provider"] = meta.get("provider", "unknown")
            row["source"] = meta.get("source", "unknown")
        
        data.append(row)
    
    df = pd.DataFrame(data)
    
    print(f"✅ DataFrame ready: {len(df):,} rows")
    print()
    print("📋 Columns:", list(df.columns))
    print()
    print("📊 Sample data:")
    print(df[["username", "content", "provider"]].head(3).to_string())
    print()
    
    # Launch Spotlight
    print("🚀 Launching Spotlight viewer...")
    print("   (Browser will open automatically)")
    print()
    
    from renumics import spotlight
    
    # Show with embedding visualization
    spotlight.show(
        df,
        embed=["embedding"],  # Kolom embedding untuk UMAP projection
        dtype={"embedding": spotlight.Embedding},  # Type hint
    )

if __name__ == "__main__":
    main()
