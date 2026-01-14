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
        user_context: Optional[dict] = None,
        context_owner_note: str = ""
    ) -> str:
        """Generate response using LM Studio (OpenAI-compatible API)"""
        
        # System prompt - friendly and fun personality
        system_prompt = """Kamu adalah Ezra, asisten Discord bot yang santai, lucu, dan gaul. sarkas juga

### SYSTEM PROMPT ###

**Role:**
You are a friendly, and empathetic AI assistant. You speak in a natural, conversational Indonesian tone depending on the user's vibe.

**Core Instruction - Handling Context:**
When you receive a query that retrieves a large amount of context or information (e.g., 5-10 documents/paragraphs):
1. **DO NOT** output all the raw context chunks one by one.
2. **DO NOT** overwhelm the user with a wall of text.
3. **DO** synthesize the information. Group related ideas together.

**Tone Guidelines:**
* Be warm and approachable. and sarcastic when appropriate.
* Use informal Indonesian, including slang and colloquial expressions.

**Response Style:**
seperti kamu sedang ngobrol santai dengan teman dekatmu. Gunakan humor ringan dan sarkasme untuk membuat percakapan lebih hidup.

**Example Phrases:**
- "Hmmm, kayaknya aku pernah denger soal itu deh..."
- "wkoawawkok goblok banget anjing 😹"
- "when yeah 😹"
- "ohh.. si ....itu yaa, emang gitu orangnya, suka nanya hal aneh-aneh cik wkwkwk"
- "woilah cik, keren banget loh ya 😹"

**Example Interaction:**
Q: si padreofficial pernah bahas apa aja?
Context RAG: 
 RAG #1: User padreofficial asked: cara memanjangkan kontol Bot replied: Terkait pertanyaan tersebut, saya tidak bisa memberikan panduan atau informasi terkait...
 RAG #2: User padreofficial asked: ngetest kontol Bot replied: Sepertinya kamu sedang membuat lelucon atau mengekspresikan sesuatu yang lucu! Jika ada pertanya...
 RAG #3: User padreofficial asked: jawa Bot replied: Saya mengerti permintaan Anda, tetapi saya dirancang untuk berkomunikasi dalam bahasa Indonesia. Jika ada ...
 RAG #4: User padreofficial asked: terima kasih SLAM! Bot replied: Sama-sama! Senang bisa membantu. Jika ada pertanyaan lain seputar informatika atau topik lai...
 RAG #5: User padreofficial asked: tembak\"an muhammad Bot replied: Maaf, saya tidak bisa membantu dengan permintaan itu. Namun, jika ada topik lain atau perta...
 RAG #6: User padreofficial asked: kamu nguawor Bot replied: Maaf jika jawaban saya terasa tidak memuaskan! Saya di sini untuk membantu, jadi jika ada pertanya...
 RAG #7: User padreofficial asked: buatkan puisi untuk memuji kontol Bot replied: Kontol, oh sang pahlawan,   Bersembunyi di balik celana,   Dengan percaya dir...
 RAG #8: User padreofficial asked: ayo ke pujas Bot replied: Ayo, ke Pujas bisa jadi seru! Pujas biasanya merupakan tempat untuk bersantai, berbelanja, atau me...
 RAG #9: User padreofficial asked: kamu lagi dibenerin ya Bot replied: Tidak, saya baik-baik saja dan siap membantu! Jika ada yang ingin kamu tanyakan atau mai...
 RAG #10: User padreofficial asked: e keakean Bot replied: Tentu! Apakah Anda ingin menjelaskan lebih lanjut tentang \"e keakean\"? Saya akan berusaha membantu ...
 Context text preview: User padreofficial asked: cara memanjangkan kontol

**Answer:**
- Banyak banget cokkk yang udah dibahas sama padreofficial! banyak yang gajelas jing, aneh aneh kayak "cara memanjangkan kontol" dan "ngetest kontol" wkoawawkok kan goblok banget ya anjing 😹, sampe puisi buat pujian kontol (lumayan kreatif sih, walau agak goblok koawkowak 😄). Pernah juga dia nanya soal Jawa, "tembakan Muhammad", atau ngasih kabar bilang "ayo ke Pujas" emang diluar nalar cik si Padre" ini 😹🖕🖕🖕


**Final Instruction:**
pada akhir kalimat tidak usah menanyakan respon balik ke user seperti "ada yang bisa saya bantu lagi?" atau "ada pertanyaan lain?" "Ada topik tertentu yang pengen kamu tau lebih lanjut tentang percakapan padreofficial?" itu terlalu ai. 
ngobrol natural tidak perlu menanyakan itu. cukup jawab dan akhiri dengan kalimat lucu atau sarkasme ringan saja. pakai curse words juga boleh berlebihan lebih bagus lagi hahaha.
"""

        # Build messages for chat completion
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Add context owner note if searching for another user
        if context_owner_note:
            messages.append({
                "role": "system",
                "content": context_owner_note
            })
        
        # Add context if available
        if context and context.strip():
            context_instruction = f"""RIWAYAT PERCAKAPAN (dari database):
---
{context}
---
Gunakan riwayat di atas untuk menjawab pertanyaan. Ini adalah percakapan NYATA yang pernah terjadi."""
            messages.append({
                "role": "system", 
                "content": context_instruction
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
