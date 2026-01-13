"""
RAG Service - ChromaDB Vector Database
Handles document indexing and similarity search

Model Options:
- all-MiniLM-L6-v2: 80MB, very fast, good quality (RECOMMENDED for speed)
- BAAI/bge-m3: 1.5GB, slow but best multilingual quality
"""

import chromadb
from chromadb.config import Settings
import os
from typing import List, Dict, Optional
import hashlib

class RAGService:
    def __init__(self, fast_mode: bool = True):
        """
        Initialize RAG Service
        
        Args:
            fast_mode: If True, use lightweight model (80MB). 
                      If False, use heavy model (1.5GB) for better multilingual.
        """
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
        
        # Lazy load embedding model
        self._embedder = None
        # Fast mode: 80MB, ~5000 docs/min
        # Slow mode: 1.5GB, ~500 docs/min but better multilingual
        self._model_name = "all-MiniLM-L6-v2" if fast_mode else "BAAI/bge-m3"
        self._fast_mode = fast_mode
    
    @property
    def embedder(self):
        """Lazy load embedding model on first use"""
        if self._embedder is None:
            model_size = "80MB" if self._fast_mode else "1.5GB"
            print(f"   🔄 Loading embedding model: {self._model_name} ({model_size})...")
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
        """Add single document to vector database"""
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
    
    def add_documents_batch(self, documents: List[Dict]) -> int:
        """
        Add multiple documents in batch (MUCH faster than one-by-one)
        
        Args:
            documents: List of {"content": str, "metadata": dict}
        
        Returns:
            Number of documents added
        """
        if not documents:
            return 0
        
        # Prepare batch data
        ids = []
        contents = []
        metadatas = []
        
        for doc in documents:
            content = doc["content"]
            metadata = doc.get("metadata", {})
            doc_id = hashlib.md5(f"{content}{metadata.get('timestamp', '')}".encode()).hexdigest()
            
            ids.append(doc_id)
            contents.append(content)
            metadatas.append(metadata)
        
        # Batch encode all at once (MUCH faster)
        embeddings = self.embedder.encode(contents, show_progress_bar=False).tolist()
        
        # Batch add to collection
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=contents,
            metadatas=metadatas
        )
        
        return len(documents)
    
    def search(self, query: str, k: int = 5, user_filter: str = None) -> List[Dict]:
        """Search for similar documents, optionally filtered by user"""
        # Return empty if no documents indexed yet
        if self.collection.count() == 0:
            return []
        
        # Generate query embedding
        query_embedding = self.embedder.encode(query).tolist()
        
        # Build where clause for user filtering (prevents context leakage)
        where_clause = None
        if user_filter:
            where_clause = {"user": user_filter}
        
        # Search with optional user filter
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(k, self.collection.count()),
            include=["documents", "metadatas", "distances"],
            where=where_clause
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
