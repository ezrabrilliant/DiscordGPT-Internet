"""
LLM Service - Local LLM Integration via LM Studio
Handles text generation using LM Studio's OpenAI-compatible API
"""

import httpx
import os
import asyncio
from typing import Optional

class LLMService:
    """LLM Service - supports LM Studio (OpenAI-compatible API)"""
    
    def __init__(self):
        # LM Studio default: http://localhost:1234/v1
        self.base_url = os.getenv("LLM_URL", "http://localhost:1234/v1")
        self.model_name = os.getenv("LLM_MODEL", "google/gemma-3n-e4b")  # Model loaded in LM Studio
        self.client = httpx.AsyncClient(timeout=120.0)
        self._model_loaded = False
    
    async def is_available(self) -> bool:
        """Check if LM Studio server is running"""
        try:
            response = await self.client.get(f"{self.base_url}/models", timeout=5.0)
            return response.status_code == 200
        except:
            return False
    
    async def ensure_model_loaded(self) -> bool:
        """Check if model is loaded in LM Studio"""
        if self._model_loaded:
            return True
        
        try:
            # LM Studio auto-loads model, just check if server responds
            response = await self.client.get(f"{self.base_url}/models", timeout=10.0)
            if response.status_code == 200:
                models = response.json().get("data", [])
                self._model_loaded = len(models) > 0
                return self._model_loaded
            return False
        except:
            return False
    
    async def generate(
        self, 
        prompt: str, 
        context: str = "", 
        user_context: Optional[dict] = None
    ) -> str:
        """Generate response using LM Studio (OpenAI-compatible API)"""
        
        # System prompt - friendly and fun personality like gemma 3n
        system_prompt = """Kamu adalah Ezra, asisten Discord bot yang ramah, lucu, dan suka bercanda.
Kamu punya akses ke riwayat percakapan server Discord ini.
Gunakan konteks yang diberikan untuk menjawab pertanyaan tentang percakapan sebelumnya.
Jawab dengan santai, fun, dan friendly. Boleh pakai emoji sesekali 😄
Balas dengan bahasa yang sama dengan user (Indonesia/English).
Jika konteks tidak berisi informasi relevan, katakan dengan jujur tapi tetap ramah."""

        # Build messages for chat completion
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Add context if available
        if context and context.strip():
            messages.append({
                "role": "system", 
                "content": f"Berikut riwayat percakapan yang relevan:\n{context}"
            })
        
        # Add user info if available
        user_prefix = ""
        if user_context and user_context.get("username"):
            user_prefix = f"[{user_context.get('username')}]: "
        
        messages.append({
            "role": "user",
            "content": f"{user_prefix}{prompt}"
        })

        try:
            response = await self.client.post(
                f"{self.base_url}/chat/completions",
                json={
                    "model": self.model_name,
                    "messages": messages,
                    "temperature": 0.8,
                    "max_tokens": 500,
                    "top_p": 0.95,
                    "stream": False
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                result = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                return result if result else "Hmm, aku bingung mau jawab apa 😅"
            else:
                return f"⚠️ LM Studio error (status {response.status_code})"
                
        except httpx.TimeoutException:
            return "⏱️ Maaf, AI terlalu lama merespons. Coba lagi ya!"
        except httpx.ConnectError:
            return "🔌 LM Studio tidak terkoneksi. Pastikan server sudah jalan di LM Studio!"
        except Exception as e:
            return f"❌ Error: {str(e)}"
    
    async def list_models(self):
        """List available models from LM Studio"""
        try:
            response = await self.client.get(f"{self.base_url}/models")
            if response.status_code == 200:
                return response.json().get("data", [])
            return []
        except:
            return []
