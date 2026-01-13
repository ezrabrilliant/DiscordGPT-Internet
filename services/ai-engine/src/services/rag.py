"""
RAG Service - ChromaDB Vector Database
Handles document indexing and similarity search
"""

import chromadb
from chromadb.config import Settings
import os
from typing import List, Dict, Optional
import hashlib

class RAGService:
    def __init__(self):
        # Use persistent storage
        db_path = os.getenv("CHROMADB_PATH", "./data/chromadb")
        
        # Ensure directory exists
        os.makedirs(db_path, exist_ok=True)
        
        print(f"   📂 ChromaDB path: {db_path}")
        self.client = chromadb.PersistentClient(path=db_path)
        
        # Get or create collection
        self.collection = self.client.get_or_create_collection(
            name="discord_conversations",
            metadata={"hnsw:space": "cosine"}
        )
        
        # Lazy load embedding model (heavy, ~1.5GB)
        self._embedder = None
        self._model_name = "BAAI/bge-m3"
    
    @property
    def embedder(self):
        """Lazy load embedding model on first use"""
        if self._embedder is None:
            print("   🔄 Loading embedding model (first time, please wait)...")
            from sentence_transformers import SentenceTransformer
            self._embedder = SentenceTransformer(self._model_name)
            print("   ✅ Embedding model loaded!")
        return self._embedder
    
    def is_available(self) -> bool:
        """Check if ChromaDB is available"""
        try:
            self.collection.count()
            return True
        except:
            return False
    
    def add_document(self, content: str, metadata: Dict) -> str:
        """Add document to vector database"""
        # Generate unique ID
        doc_id = hashlib.md5(f"{content}{metadata.get('timestamp', '')}".encode()).hexdigest()
        
        # Generate embedding
        embedding = self.embedder.encode(content).tolist()
        
        # Add to collection
        self.collection.add(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[content],
            metadatas=[metadata]
        )
        
        return doc_id
    
    def search(self, query: str, k: int = 5) -> List[Dict]:
        """Search for similar documents"""
        # Return empty if no documents indexed yet
        if self.collection.count() == 0:
            return []
        
        # Generate query embedding
        query_embedding = self.embedder.encode(query).tolist()
        
        # Search
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(k, self.collection.count()),  # Don't request more than available
            include=["documents", "metadatas", "distances"]
        )
        
        # Format results
        documents = []
        if results["documents"] and results["documents"][0]:
            for i, doc in enumerate(results["documents"][0]):
                documents.append({
                    "content": doc,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else 0
                })
        
        return documents
    
    def get_document_count(self) -> int:
        """Get total number of indexed documents"""
        return self.collection.count()
    
    def clear_all(self):
        """Clear all documents (use with caution)"""
        self.client.delete_collection("discord_conversations")
        self.collection = self.client.get_or_create_collection(
            name="discord_conversations",
            metadata={"hnsw:space": "cosine"}
        )
