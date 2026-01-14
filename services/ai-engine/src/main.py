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
import asyncio
import os
import sys
import re
import json
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add src to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.rag import RAGService
from services.llm import LLMService

# Global services (initialized in lifespan)
rag_service: RAGService = None
llm_service: LLMService = None

# User mapping for username -> user ID lookup
USER_MAPPING_FILE = os.path.join(os.path.dirname(__file__), '../data/user-mapping.json')
user_mapping = {}

def load_user_mapping():
    """Load username to user ID mapping"""
    global user_mapping
    try:
        if os.path.exists(USER_MAPPING_FILE):
            with open(USER_MAPPING_FILE, 'r', encoding='utf-8') as f:
                user_mapping = json.load(f)
            print(f"   📋 Loaded {len(user_mapping)} usernames from user-mapping.json")
    except Exception as e:
        print(f"   ⚠️ Failed to load user-mapping.json: {e}")

def find_mentioned_user(message: str) -> tuple[str, str]:
    """
    Find if a username is mentioned in the message.
    Returns (username, user_id) if found, else (None, None)
    """
    message_lower = message.lower()
    for username, servers in user_mapping.items():
        # Check if username appears in message
        if username.lower() in message_lower:
            # Return first user ID found for this username
            if servers and len(servers) > 0:
                return username, servers[0].get('user')
    return None, None

# Cached health status (to avoid slow checks on every request)
_cached_llm_status = False
_last_llm_check = None
_llm_check_interval = 30  # Seconds between actual LLM health checks

# API Key for security (REQUIRED for tunnel security)
API_KEY = os.getenv("API_KEY", None)
if not API_KEY:
    print("⚠️  WARNING: No API_KEY set! Add API_KEY to .env for security")
    print("   Example: API_KEY=your-secret-key-here")

async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    """Verify API key - required for all protected endpoints"""
    if not API_KEY:
        # No key configured = allow all (dev mode)
        return True
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    return True

# ============================================
# Console UI Helpers
# ============================================

def print_banner():
    """Print beautiful startup banner"""
    banner = """
\033[36m╔══════════════════════════════════════════════════════════════╗
║                                                                ║
║   ███████╗███████╗██████╗  █████╗      █████╗ ██╗              ║
║   ██╔════╝╚══███╔╝██╔══██╗██╔══██╗    ██╔══██╗██║              ║
║   █████╗    ███╔╝ ██████╔╝███████║    ███████║██║              ║
║   ██╔══╝   ███╔╝  ██╔══██╗██╔══██║    ██╔══██║██║              ║
║   ███████╗███████╗██║  ██║██║  ██║    ██║  ██║██║              ║
║   ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝              ║
║                                                                ║
║   \033[33m🤖 Local AI Engine with RAG Memory\033[36m                          ║
║   \033[33m📚 ChromaDB + LM Studio + Cloudflare Tunnel\033[36m                 ║
║                                                                ║
╚══════════════════════════════════════════════════════════════╝\033[0m
"""
    print(banner)

def print_section(title: str, icon: str = "📦"):
    """Print section header"""
    print(f"\n\033[36m{'─' * 50}\033[0m")
    print(f" {icon} \033[1m{title}\033[0m")
    print(f"\033[36m{'─' * 50}\033[0m")

def print_status(message: str, status: str = "ok"):
    """Print status message with color"""
    colors = {
        "ok": "\033[32m✓\033[0m",      # Green checkmark
        "warn": "\033[33m⚠\033[0m",    # Yellow warning
        "error": "\033[31m✗\033[0m",   # Red X
        "info": "\033[36m→\033[0m",    # Cyan arrow
    }
    icon = colors.get(status, colors["info"])
    print(f"   {icon} {message}")

def print_stats_box(stats: dict):
    """Print stats in a nice box"""
    print(f"\n\033[36m┌{'─' * 40}┐\033[0m")
    for key, value in stats.items():
        print(f"\033[36m│\033[0m  {key:<25} \033[33m{value:>10}\033[0m \033[36m│\033[0m")
    print(f"\033[36m└{'─' * 40}┘\033[0m")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown"""
    global rag_service, llm_service
    
    print_banner()
    
    # Initialize RAG
    print_section("RAG Service", "📚")
    try:
        rag_service = RAGService()
        doc_count = rag_service.get_document_count()
        print_status(f"ChromaDB connected", "ok")
        print_status(f"Documents indexed: {doc_count:,}", "info")
    except Exception as e:
        print_status(f"RAG Service failed: {e}", "error")
        rag_service = None
    
    # Load user mapping
    load_user_mapping()
    if user_mapping:
        print_status(f"User mapping loaded: {len(user_mapping)} users", "ok")
    
    # Initialize LLM
    print_section("LLM Service (LM Studio)", "🤖")
    try:
        llm_service = LLMService()
        is_online = await llm_service.is_available()
        if is_online:
            print_status(f"LM Studio connected", "ok")
            print_status(f"Model: {llm_service.model_name}", "info")
        else:
            print_status("LM Studio not running", "warn")
            print_status("Start LM Studio and load a model", "info")
    except Exception as e:
        print_status(f"LLM Service failed: {e}", "error")
        llm_service = None
    
    # Server info
    port = int(os.getenv("PORT", 8000))
    print_section("Server Ready", "🌐")
    print_status(f"Local:  http://localhost:{port}", "info")
    print_status(f"API Key: {'Enabled' if API_KEY else 'Disabled (dev mode)'}", "ok" if API_KEY else "warn")
    
    # Stats
    print_stats_box({
        "Documents": f"{rag_service.get_document_count():,}" if rag_service else "N/A",
        "Users": f"{len(user_mapping):,}",
        "LLM": "Online" if llm_service and await llm_service.is_available() else "Offline",
    })
    
    print(f"\n\033[32m{'═' * 50}\033[0m")
    print(f"\033[32m  🚀 Ezra AI Engine is ready!\033[0m")
    print(f"\033[32m{'═' * 50}\033[0m\n")
    
    yield  # Server is running
    
    # Shutdown
    print(f"\n\033[33m👋 Shutting down AI Engine...\033[0m")
    if llm_service and llm_service.client:
        await llm_service.client.aclose()

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
    user: Optional[str] = None  # User ID for context isolation
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

@app.get("/ping")
async def ping():
    """Ultra-lightweight ping endpoint - instant response"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for Discord bot (uses cached LLM status)"""
    global _cached_llm_status, _last_llm_check
    
    chromadb_ok = False
    ollama_ok = _cached_llm_status  # Use cached by default
    
    # Only check LLM status every 30 seconds
    now = datetime.now()
    should_check_llm = (
        _last_llm_check is None or 
        (now - _last_llm_check).total_seconds() > _llm_check_interval
    )
    
    if should_check_llm and llm_service:
        try:
            ollama_ok = await asyncio.wait_for(
                llm_service.is_available(),
                timeout=3.0  # Max 3 seconds for LLM check
            )
            _cached_llm_status = ollama_ok
            _last_llm_check = now
        except asyncio.TimeoutError:
            ollama_ok = _cached_llm_status  # Use cached if timeout
        except Exception:
            ollama_ok = False
    
    if rag_service:
        chromadb_ok = rag_service.is_available()
    
    return HealthResponse(
        status="healthy" if (ollama_ok and chromadb_ok) else "degraded",
        ollama=ollama_ok,
        chromadb=chromadb_ok,
        timestamp=now.isoformat()
    )

@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(verify_api_key)])
async def chat(request: ChatRequest):
    """Process chat message with RAG context"""
    if not llm_service:
        raise HTTPException(status_code=503, detail="Ollama service not available")
    
    try:
        # Debug logging
        print(f"[DEBUG] Chat request - user: {request.user}, message: {request.message[:50]}...")
        
        # Detect if user is asking about conversation history
        history_keywords = ['pernah', 'sebelumnya', 'riwayat', 'history', 'tanyakan', 'bahas', 'ngobrol', 'cerita']
        is_history_question = any(kw in request.message.lower() for kw in history_keywords)
        
        # Check if user is asking about ANOTHER user's history
        mentioned_username, mentioned_user_id = find_mentioned_user(request.message)
        target_user = request.user  # Default: search current user's history
        
        if mentioned_user_id and mentioned_user_id != request.user:
            # User is asking about someone else!
            target_user = mentioned_user_id
            print(f"[DEBUG] Searching for user '{mentioned_username}' (ID: {mentioned_user_id})")
        
        # 1. Search for relevant context from target user's history
        context_docs = []
        if rag_service:
            # For history questions, use a generic query to get diverse results
            search_query = request.message
            k_results = 10
            
            if is_history_question:
                # Use empty/generic query to get random sample of user's history
                search_query = "percakapan topik"  # Generic to get diverse results
                k_results = 10  # Get history questions
                print(f"[DEBUG] History question detected, using generic search")
            
            context_docs = rag_service.search(search_query, k=k_results, user_filter=target_user)
            print(f"[DEBUG] RAG found {len(context_docs)} context docs for user {target_user}")
            
            # Print all RAG results for debugging
            for i, doc in enumerate(context_docs):
                content_preview = doc.get('content', '')[:150].replace('\n', ' ')
                print(f"[DEBUG] RAG #{i+1}: {content_preview}...")
        
        # 2. Build prompt with context (filter out None values)
        context_text = ""
        context_owner_info = ""  # Info about whose context this is
        
        if context_docs:
            valid_contents = [doc.get("content", "") for doc in context_docs if doc.get("content")]
            context_text = "\n---\n".join(valid_contents) if valid_contents else ""
            print(f"[DEBUG] Context text preview: {context_text[:300]}...")
        
        # If searching for another user, tell LLM whose history this is
        if mentioned_username and mentioned_user_id != request.user:
            context_owner_info = f"CATATAN: Riwayat percakapan di bawah adalah milik user '{mentioned_username}', BUKAN user yang bertanya. Jawab dengan menyebut '{mentioned_username}' atau 'dia/mereka', bukan 'kamu'."
        
        # 3. Generate response with LLM
        response = await llm_service.generate(
            prompt=request.message,
            context=context_text,
            user_context=request.context,
            context_owner_note=context_owner_info
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
    if llm_service:
        model_name = llm_service.model_name
    
    return {
        "documents_indexed": doc_count,
        "ollama_model": model_name,
        "rag_available": rag_service is not None,
        "ollama_available": llm_service is not None,
        "uptime": "running"
    }

# ============================================
# Optimized Log Sync System
# ============================================

# Track sync progress (persisted to file)
SYNC_STATE_FILE = os.path.join(os.path.dirname(__file__), "../data/sync_state.json")

def load_sync_state():
    """Load last sync position"""
    try:
        if os.path.exists(SYNC_STATE_FILE):
            with open(SYNC_STATE_FILE, 'r') as f:
                return json.load(f)
    except:
        pass
    return {"last_line": 0, "last_sync": None}

def save_sync_state(state):
    """Save sync position"""
    os.makedirs(os.path.dirname(SYNC_STATE_FILE), exist_ok=True)
    with open(SYNC_STATE_FILE, 'w') as f:
        json.dump(state, f)

class SyncLogsRequest(BaseModel):
    log_path: Optional[str] = None
    batch_size: int = 100  # Process 100 entries per batch
    max_entries: Optional[int] = None  # Limit total entries (None = all new)
    force_full: bool = False  # Force re-sync from beginning

def parse_log_line(line: str) -> Optional[dict]:
    """Parse a single log line, return dict or None if not valid"""
    line = line.strip()
    if not line:
        return None
    
    try:
        # New JSON format: 2026-01-13T18:19:09.059Z - {"timestamp":...}
        json_match = re.match(r'^([\d\-T:.Z]+) - ({.*})$', line)
        if json_match:
            timestamp_prefix = json_match.group(1)
            data = json.loads(json_match.group(2))
            if 'query' in data and 'reply' in data:
                return {
                    "content": f"User {data.get('username', 'unknown')} asked: {data['query']}\nBot replied: {data['reply']}",
                    "metadata": {
                        "server": data.get('server', 'unknown'),
                        "user": data.get('user', 'unknown'),
                        "username": data.get('username', 'unknown'),
                        "timestamp": data.get('timestamp', timestamp_prefix),
                        "provider": data.get('provider', 'unknown'),
                        "source": "sync"
                    }
                }
        
        # Old format: 2026-01-13T08:10:50.103Z - "[User: @name],...
        old_match = re.match(r'^([\d\-T:.Z]+) - "\[User: @?([^\]]+)\],\\n \[Query: ([^\]]*)\],\\n \[reply: ([^\]]*)\]', line)
        if old_match:
            timestamp, username, query, reply = old_match.groups()
            query = query.replace('\\n', '\n').strip()
            reply = reply.replace('\\n', '\n').strip()
            return {
                "content": f"User {username} asked: {query}\nBot replied: {reply}",
                "metadata": {
                    "server": "unknown",
                    "user": "unknown",
                    "username": username,
                    "timestamp": timestamp,
                    "provider": "legacy",
                    "source": "sync"
                }
            }
    except:
        pass
    return None

@app.post("/sync-logs", dependencies=[Depends(verify_api_key)])
async def sync_logs(request: SyncLogsRequest = None):
    """
    Optimized incremental log sync with batch processing.
    Only syncs NEW entries since last sync (unless force_full=True).
    """
    if not rag_service:
        raise HTTPException(status_code=503, detail="RAG service not available")
    
    if request is None:
        request = SyncLogsRequest()
    
    # Find log file
    log_path = request.log_path
    if not log_path:
        possible_paths = [
            os.path.join(os.path.dirname(__file__), "../../discord-bot/messages.log"),
            os.path.join(os.path.dirname(__file__), "../../../services/discord-bot/messages.log"),
            "C:/Users/ezrak/OneDrive/Documents/Code/js/ezra-project/DiscordGPT-Internet/services/discord-bot/messages.log"
        ]
        for p in possible_paths:
            if os.path.exists(p):
                log_path = p
                break
    
    if not log_path or not os.path.exists(log_path):
        return {"status": "skipped", "reason": "messages.log not found", "imported": 0}
    
    # Load sync state
    sync_state = load_sync_state()
    start_line = 0 if request.force_full else sync_state.get("last_line", 0)
    
    imported = 0
    skipped = 0
    processed = 0
    
    try:
        with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
            # Skip to last position
            for _ in range(start_line):
                f.readline()
            
            batch = []
            current_line = start_line
            
            for line in f:
                current_line += 1
                processed += 1
                
                # Check max entries limit
                if request.max_entries and imported >= request.max_entries:
                    break
                
                # Parse line
                parsed = parse_log_line(line)
                if parsed:
                    batch.append(parsed)
                else:
                    skipped += 1
                
                # Process batch when full
                if len(batch) >= request.batch_size:
                    for item in batch:
                        rag_service.add_document(
                            content=item["content"],
                            metadata=item["metadata"]
                        )
                        imported += 1
                    batch = []
                    
                    # Small delay to prevent overwhelming
                    await asyncio.sleep(0.01)
            
            # Process remaining batch
            for item in batch:
                rag_service.add_document(
                    content=item["content"],
                    metadata=item["metadata"]
                )
                imported += 1
        
        # Save sync state
        sync_state["last_line"] = current_line
        sync_state["last_sync"] = datetime.now().isoformat()
        save_sync_state(sync_state)
        
        return {
            "status": "success",
            "imported": imported,
            "skipped": skipped,
            "processed_lines": processed,
            "total_documents": rag_service.get_document_count(),
            "sync_position": current_line
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync logs: {str(e)}")

@app.post("/sync-logs/reset", dependencies=[Depends(verify_api_key)])
async def reset_sync_state():
    """Reset sync state to re-sync from beginning"""
    save_sync_state({"last_line": 0, "last_sync": None})
    return {"status": "reset", "message": "Sync state cleared. Next sync will start from beginning."}

@app.get("/sync-logs/status")
async def get_sync_status():
    """Get current sync status"""
    state = load_sync_state()
    doc_count = rag_service.get_document_count() if rag_service else 0
    return {
        "last_synced_line": state.get("last_line", 0),
        "last_sync_time": state.get("last_sync"),
        "total_documents": doc_count
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
