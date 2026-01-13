"""
AI Engine - Main FastAPI Application
Provides RAG-based chat using ChromaDB and Ollama
"""

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from contextlib import asynccontextmanager
import uvicorn
import os
import sys
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add src to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.rag import RAGService
from services.ollama import OllamaService

# Global services (initialized in lifespan)
rag_service: RAGService = None
ollama_service: OllamaService = None

# API Key for security (optional)
API_KEY = os.getenv("API_KEY", None)

async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    """Verify API key if configured"""
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return True

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown"""
    global rag_service, ollama_service
    
    print("=" * 50)
    print("🚀 Ezra AI Engine Starting...")
    print("=" * 50)
    
    # Initialize services
    print("\n📦 Initializing RAG Service...")
    try:
        rag_service = RAGService()
        print(f"   ✅ ChromaDB ready ({rag_service.get_document_count()} documents)")
    except Exception as e:
        print(f"   ❌ RAG Service failed: {e}")
        rag_service = None
    
    print("\n🤖 Initializing Ollama Service...")
    try:
        ollama_service = OllamaService()
        is_online = await ollama_service.is_available()
        if is_online:
            print(f"   ✅ Ollama connected (model: {ollama_service.model_name})")
        else:
            print(f"   ⚠️ Ollama not running - start with 'ollama serve'")
    except Exception as e:
        print(f"   ❌ Ollama Service failed: {e}")
        ollama_service = None
    
    port = int(os.getenv("PORT", 8000))
    print(f"\n🌐 Server running at http://localhost:{port}")
    print("=" * 50)
    
    yield  # Server is running
    
    # Shutdown
    print("\n👋 Shutting down AI Engine...")
    if ollama_service and ollama_service.client:
        await ollama_service.client.aclose()

# Initialize FastAPI app
app = FastAPI(
    title="Ezra AI Engine",
    description="RAG-based AI backend for Discord Bot",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for Discord bot access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# Request/Response Models
# ============================================

class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None

class ChatResponse(BaseModel):
    response: str
    sources: Optional[list] = None

class LogRequest(BaseModel):
    server: Optional[str] = None
    user: str
    username: str
    query: str
    reply: str

class HealthResponse(BaseModel):
    status: str
    ollama: bool
    chromadb: bool
    timestamp: str

# ============================================
# Endpoints
# ============================================

@app.get("/")
async def root():
    """Root endpoint - API info"""
    return {
        "name": "Ezra AI Engine",
        "version": "1.0.0",
        "status": "running",
        "endpoints": ["/health", "/chat", "/log", "/status"]
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for Discord bot"""
    ollama_ok = False
    chromadb_ok = False
    
    if ollama_service:
        ollama_ok = await ollama_service.is_available()
    if rag_service:
        chromadb_ok = rag_service.is_available()
    
    return HealthResponse(
        status="healthy" if (ollama_ok and chromadb_ok) else "degraded",
        ollama=ollama_ok,
        chromadb=chromadb_ok,
        timestamp=datetime.now().isoformat()
    )

@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(verify_api_key)])
async def chat(request: ChatRequest):
    """Process chat message with RAG context"""
    if not ollama_service:
        raise HTTPException(status_code=503, detail="Ollama service not available")
    
    try:
        # 1. Search for relevant context from history
        context_docs = []
        if rag_service:
            context_docs = rag_service.search(request.message, k=5)
        
        # 2. Build prompt with context
        context_text = "\n".join([doc["content"] for doc in context_docs]) if context_docs else ""
        
        # 3. Generate response with Ollama
        response = await ollama_service.generate(
            prompt=request.message,
            context=context_text,
            user_context=request.context
        )
        
        return ChatResponse(
            response=response,
            sources=[doc["metadata"] for doc in context_docs] if context_docs else []
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/log", dependencies=[Depends(verify_api_key)])
async def receive_log(request: LogRequest):
    """Receive and index log entry from Discord bot"""
    if not rag_service:
        raise HTTPException(status_code=503, detail="RAG service not available")
    
    try:
        # Add to ChromaDB for future RAG queries
        doc_id = rag_service.add_document(
            content=f"User {request.username} asked: {request.query}\nBot replied: {request.reply}",
            metadata={
                "server": request.server,
                "user": request.user,
                "username": request.username,
                "timestamp": datetime.now().isoformat()
            }
        )
        return {"status": "indexed", "doc_id": doc_id}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/status")
async def get_status():
    """Get detailed engine status"""
    doc_count = 0
    model_name = "unknown"
    
    if rag_service:
        doc_count = rag_service.get_document_count()
    if ollama_service:
        model_name = ollama_service.model_name
    
    return {
        "documents_indexed": doc_count,
        "ollama_model": model_name,
        "rag_available": rag_service is not None,
        "ollama_available": ollama_service is not None,
        "uptime": "running"
    }

# ============================================
# Main Entry Point
# ============================================

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info"
    )
