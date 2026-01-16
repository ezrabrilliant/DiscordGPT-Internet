"""
Resource Usage Monitor for AI Inference
Tracks CPU, GPU, RAM, NPU usage during prompts

Usage:
    python monitor_usage.py
"""

import os
import sys
import time
import threading
from datetime import datetime

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

try:
    import psutil
except ImportError:
    print("Installing psutil...")
    os.system(f"{sys.executable} -m pip install psutil")
    import psutil

# Try to import GPU monitoring
GPU_AVAILABLE = False
try:
    import pynvml
    pynvml.nvmlInit()
    GPU_AVAILABLE = True
except:
    try:
        # Fallback: use GPUtil
        import GPUtil
        GPU_AVAILABLE = "gputil"
    except:
        pass

class ResourceMonitor:
    def __init__(self):
        self.monitoring = False
        self.samples = []
        self.thread = None
        
    def get_cpu_usage(self):
        return psutil.cpu_percent(interval=0.1)
    
    def get_ram_usage(self):
        mem = psutil.virtual_memory()
        return {
            "percent": mem.percent,
            "used_gb": mem.used / (1024**3),
            "total_gb": mem.total / (1024**3),
        }
    
    def get_gpu_usage(self):
        if not GPU_AVAILABLE:
            return None
        
        try:
            if GPU_AVAILABLE == "gputil":
                import GPUtil
                gpus = GPUtil.getGPUs()
                if gpus:
                    gpu = gpus[0]
                    return {
                        "name": gpu.name,
                        "load_percent": gpu.load * 100,
                        "memory_percent": gpu.memoryUtil * 100,
                        "memory_used_mb": gpu.memoryUsed,
                        "memory_total_mb": gpu.memoryTotal,
                        "temperature": gpu.temperature,
                    }
            else:
                handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                name = pynvml.nvmlDeviceGetName(handle)
                temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
                
                return {
                    "name": name.decode() if isinstance(name, bytes) else name,
                    "load_percent": util.gpu,
                    "memory_percent": (info.used / info.total) * 100,
                    "memory_used_mb": info.used / (1024**2),
                    "memory_total_mb": info.total / (1024**2),
                    "temperature": temp,
                }
        except Exception as e:
            return {"error": str(e)}
        
        return None
    
    def get_process_usage(self, name_filter="python"):
        """Get usage of specific processes like LM Studio"""
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            try:
                if name_filter.lower() in proc.info['name'].lower():
                    processes.append({
                        "pid": proc.info['pid'],
                        "name": proc.info['name'],
                        "cpu": proc.cpu_percent(),
                        "memory": proc.memory_percent(),
                    })
            except:
                pass
        return processes
    
    def sample(self):
        """Take a single sample of all metrics"""
        return {
            "timestamp": datetime.now().isoformat(),
            "cpu_percent": self.get_cpu_usage(),
            "ram": self.get_ram_usage(),
            "gpu": self.get_gpu_usage(),
        }
    
    def start_monitoring(self, interval=0.5):
        """Start background monitoring"""
        self.monitoring = True
        self.samples = []
        
        def monitor_loop():
            while self.monitoring:
                self.samples.append(self.sample())
                time.sleep(interval)
        
        self.thread = threading.Thread(target=monitor_loop, daemon=True)
        self.thread.start()
    
    def stop_monitoring(self):
        """Stop monitoring and return stats"""
        self.monitoring = False
        if self.thread:
            self.thread.join(timeout=1)
        
        if not self.samples:
            return None
        
        # Calculate stats
        cpu_values = [s['cpu_percent'] for s in self.samples]
        ram_values = [s['ram']['percent'] for s in self.samples]
        
        stats = {
            "duration_seconds": len(self.samples) * 0.5,
            "samples": len(self.samples),
            "cpu": {
                "min": min(cpu_values),
                "max": max(cpu_values),
                "avg": sum(cpu_values) / len(cpu_values),
                "delta": max(cpu_values) - cpu_values[0] if cpu_values else 0,
            },
            "ram": {
                "min": min(ram_values),
                "max": max(ram_values),
                "avg": sum(ram_values) / len(ram_values),
            },
        }
        
        # GPU stats if available
        gpu_samples = [s['gpu'] for s in self.samples if s['gpu'] and 'load_percent' in s['gpu']]
        if gpu_samples:
            gpu_loads = [g['load_percent'] for g in gpu_samples]
            gpu_mems = [g['memory_percent'] for g in gpu_samples]
            stats["gpu"] = {
                "name": gpu_samples[0].get('name', 'Unknown'),
                "load_min": min(gpu_loads),
                "load_max": max(gpu_loads),
                "load_avg": sum(gpu_loads) / len(gpu_loads),
                "load_delta": max(gpu_loads) - gpu_loads[0] if gpu_loads else 0,
                "memory_min": min(gpu_mems),
                "memory_max": max(gpu_mems),
                "memory_avg": sum(gpu_mems) / len(gpu_mems),
            }
        
        return stats


def print_live_usage(monitor, duration=10):
    """Print live usage for specified duration"""
    print("\n" + "=" * 60)
    print("  📊 Live Resource Monitor")
    print("=" * 60)
    print(f"  Monitoring for {duration} seconds... Press Ctrl+C to stop")
    print()
    
    try:
        for i in range(duration * 2):
            sample = monitor.sample()
            
            # Clear line and print
            cpu = sample['cpu_percent']
            ram = sample['ram']
            gpu = sample['gpu']
            
            # CPU bar
            cpu_bar = "█" * int(cpu / 5) + "░" * (20 - int(cpu / 5))
            
            # RAM bar
            ram_bar = "█" * int(ram['percent'] / 5) + "░" * (20 - int(ram['percent'] / 5))
            
            print(f"\r  CPU: [{cpu_bar}] {cpu:5.1f}%  |  RAM: [{ram_bar}] {ram['percent']:5.1f}% ({ram['used_gb']:.1f}/{ram['total_gb']:.1f} GB)", end="")
            
            if gpu and 'load_percent' in gpu:
                gpu_bar = "█" * int(gpu['load_percent'] / 5) + "░" * (20 - int(gpu['load_percent'] / 5))
                print(f"\n  GPU: [{gpu_bar}] {gpu['load_percent']:5.1f}%  |  VRAM: {gpu['memory_used_mb']:.0f}/{gpu['memory_total_mb']:.0f} MB  |  {gpu['temperature']}°C", end="")
                print("\033[F", end="")  # Move cursor up
            
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    
    print("\n")


def test_with_prompt():
    """Test resource usage with actual AI prompt"""
    import requests
    
    monitor = ResourceMonitor()
    
    print("\n" + "=" * 60)
    print("  🧪 AI Prompt Resource Test")
    print("=" * 60)
    
    # Check if AI Engine is running
    try:
        requests.get("http://localhost:8000/ping", timeout=2)
    except:
        print("  ❌ AI Engine not running! Start it first.")
        return
    
    print("  ✅ AI Engine connected")
    
    # Find LM Studio process
    lm_process = None
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent']):
        try:
            name = proc.info['name'].lower()
            if 'lm studio' in name or 'lmstudio' in name or 'llama' in name:
                lm_process = proc
                print(f"  ✅ Found LM Studio process: {proc.info['name']} (PID {proc.info['pid']})")
                break
        except:
            pass
    
    if not lm_process:
        print("  ⚠️  LM Studio process not found - will show system-wide GPU usage")
    
    print()
    
    prompt = input("  Enter test prompt (or press Enter for default): ").strip()
    if not prompt:
        prompt = "Jelaskan tentang machine learning dalam 3 paragraf"
    
    print(f"\n  📝 Prompt: {prompt[:50]}...")
    print()
    
    # Take baseline samples (5 samples over 2.5 seconds)
    print("  📏 Taking baseline measurements...")
    baseline_cpu = []
    baseline_gpu = []
    baseline_lm_cpu = []
    baseline_lm_mem = []
    
    for _ in range(5):
        baseline_cpu.append(psutil.cpu_percent(interval=0.1))
        gpu = monitor.get_gpu_usage()
        if gpu and 'load_percent' in gpu:
            baseline_gpu.append(gpu['load_percent'])
        if lm_process:
            try:
                baseline_lm_cpu.append(lm_process.cpu_percent())
                baseline_lm_mem.append(lm_process.memory_info().rss / (1024**3))
            except:
                pass
        time.sleep(0.4)
    
    avg_baseline_cpu = sum(baseline_cpu) / len(baseline_cpu) if baseline_cpu else 0
    avg_baseline_gpu = sum(baseline_gpu) / len(baseline_gpu) if baseline_gpu else 0
    avg_baseline_lm_cpu = sum(baseline_lm_cpu) / len(baseline_lm_cpu) if baseline_lm_cpu else 0
    avg_baseline_lm_mem = sum(baseline_lm_mem) / len(baseline_lm_mem) if baseline_lm_mem else 0
    
    print(f"     System CPU baseline: {avg_baseline_cpu:.1f}%")
    print(f"     System GPU baseline: {avg_baseline_gpu:.1f}%")
    if lm_process:
        print(f"     LM Studio CPU baseline: {avg_baseline_lm_cpu:.1f}%")
        print(f"     LM Studio RAM baseline: {avg_baseline_lm_mem:.2f} GB")
    print()
    
    print("  ⏳ Sending request and monitoring inference...")
    print()
    
    # Collect samples during inference
    inference_cpu = []
    inference_gpu = []
    inference_gpu_mem = []
    inference_lm_cpu = []
    inference_lm_mem = []
    
    inference_done = threading.Event()
    
    def collect_samples():
        while not inference_done.is_set():
            inference_cpu.append(psutil.cpu_percent(interval=0.1))
            gpu = monitor.get_gpu_usage()
            if gpu and 'load_percent' in gpu:
                inference_gpu.append(gpu['load_percent'])
                inference_gpu_mem.append(gpu['memory_used_mb'])
            if lm_process:
                try:
                    inference_lm_cpu.append(lm_process.cpu_percent())
                    inference_lm_mem.append(lm_process.memory_info().rss / (1024**3))
                except:
                    pass
            time.sleep(0.3)
    
    # Start sampling thread
    sample_thread = threading.Thread(target=collect_samples, daemon=True)
    sample_thread.start()
    
    # Send request
    start_time = time.time()
    try:
        response = requests.post(
            "http://localhost:8000/chat",
            json={
                "message": prompt,
                "userId": "monitor-test",
                "username": "monitor",
                "serverId": "test",
                "serverName": "test",
            },
            headers={"X-API-Key": "ezra-ai-secret-2026"},
            timeout=120,
        )
        elapsed = time.time() - start_time
        result = response.json()
    except Exception as e:
        print(f"  ❌ Error: {e}")
        inference_done.set()
        return
    
    # Stop sampling
    inference_done.set()
    sample_thread.join(timeout=1)
    
    # Calculate inference-specific usage
    print("  " + "=" * 56)
    print("  📊 INFERENCE RESOURCE USAGE")
    print("  " + "=" * 56)
    print()
    print(f"  ⏱️  Response Time: {elapsed:.2f}s")
    print(f"  🤖 Provider: {result.get('provider', 'unknown')}")
    print(f"  📝 Tokens: ~{len(result.get('response', '').split())} words")
    print()
    
    # System-wide stats
    print("  ┌─────────────────────────────────────────────────────┐")
    print("  │  SYSTEM-WIDE USAGE                                  │")
    print("  └─────────────────────────────────────────────────────┘")
    
    if inference_cpu:
        peak_cpu = max(inference_cpu)
        avg_cpu = sum(inference_cpu) / len(inference_cpu)
        delta_cpu = peak_cpu - avg_baseline_cpu
        print(f"  💻 CPU:  Peak {peak_cpu:.1f}%  |  Avg {avg_cpu:.1f}%  |  Δ +{delta_cpu:.1f}%")
    
    if inference_gpu:
        peak_gpu = max(inference_gpu)
        avg_gpu = sum(inference_gpu) / len(inference_gpu)
        delta_gpu = peak_gpu - avg_baseline_gpu
        peak_vram = max(inference_gpu_mem) if inference_gpu_mem else 0
        print(f"  🎮 GPU:  Peak {peak_gpu:.1f}%  |  Avg {avg_gpu:.1f}%  |  Δ +{delta_gpu:.1f}%")
        print(f"  📦 VRAM: Peak {peak_vram:.0f} MB")
    
    print()
    
    # LM Studio specific stats
    if lm_process and inference_lm_cpu:
        print("  ┌─────────────────────────────────────────────────────┐")
        print("  │  LM STUDIO PROCESS ONLY (Inference Load)           │")
        print("  └─────────────────────────────────────────────────────┘")
        
        peak_lm_cpu = max(inference_lm_cpu)
        avg_lm_cpu = sum(inference_lm_cpu) / len(inference_lm_cpu)
        delta_lm_cpu = peak_lm_cpu - avg_baseline_lm_cpu
        
        peak_lm_mem = max(inference_lm_mem)
        delta_lm_mem = peak_lm_mem - avg_baseline_lm_mem
        
        print(f"  💻 CPU:  Peak {peak_lm_cpu:.1f}%  |  Avg {avg_lm_cpu:.1f}%  |  Δ +{delta_lm_cpu:.1f}%")
        print(f"  🧠 RAM:  Peak {peak_lm_mem:.2f} GB  |  Δ +{delta_lm_mem*1024:.0f} MB")
        print()
        
        # Calculate per-inference cost
        print("  ┌─────────────────────────────────────────────────────┐")
        print("  │  📈 PER-PROMPT INFERENCE COST                       │")
        print("  └─────────────────────────────────────────────────────┘")
        print(f"  ⚡ GPU Load Added:     +{delta_gpu:.1f}% for {elapsed:.1f}s")
        print(f"  ⚡ CPU Load Added:     +{delta_lm_cpu:.1f}% for {elapsed:.1f}s")
        print(f"  ⚡ RAM Used by Model:  {peak_lm_mem:.2f} GB")
        if inference_gpu_mem:
            print(f"  ⚡ VRAM Used by Model: {peak_vram:.0f} MB")
        
        # Estimate tokens per second
        response_text = result.get('response', '')
        word_count = len(response_text.split())
        tokens_estimate = int(word_count * 1.3)  # rough estimate
        tps = tokens_estimate / elapsed if elapsed > 0 else 0
        print(f"  ⚡ Est. Speed:         ~{tps:.1f} tokens/sec")
    
    print()
    print("  " + "-" * 56)
    print(f"  📄 Response: {result.get('response', '')[:80]}...")
    print()


def main():
    print("\n" + "=" * 60)
    print("  🖥️  Resource Usage Monitor")
    print("=" * 60)
    print()
    print("  [1] Live monitor (watch CPU/GPU/RAM)")
    print("  [2] Test with AI prompt (measure inference)")
    print("  [3] Show current usage once")
    print("  [4] Monitor LM Studio process")
    print()
    
    choice = input("  Select option (1-4): ").strip()
    
    monitor = ResourceMonitor()
    
    if choice == "1":
        duration = input("  Duration in seconds (default 30): ").strip()
        duration = int(duration) if duration.isdigit() else 30
        print_live_usage(monitor, duration)
        
    elif choice == "2":
        test_with_prompt()
        
    elif choice == "3":
        sample = monitor.sample()
        print()
        print(f"  CPU: {sample['cpu_percent']:.1f}%")
        print(f"  RAM: {sample['ram']['percent']:.1f}% ({sample['ram']['used_gb']:.1f}/{sample['ram']['total_gb']:.1f} GB)")
        if sample['gpu']:
            gpu = sample['gpu']
            if 'load_percent' in gpu:
                print(f"  GPU: {gpu['load_percent']:.1f}% | VRAM: {gpu['memory_percent']:.1f}% | {gpu['temperature']}°C")
            else:
                print(f"  GPU: {gpu}")
        else:
            print("  GPU: Not detected (NVIDIA only)")
        print()
        
    elif choice == "4":
        print("\n  Searching for LM Studio process...")
        procs = monitor.get_process_usage("lm studio")
        procs += monitor.get_process_usage("lmstudio")
        procs += monitor.get_process_usage("llama")
        
        if procs:
            for p in procs:
                print(f"  - {p['name']} (PID {p['pid']}): CPU {p['cpu']:.1f}%, RAM {p['memory']:.1f}%")
        else:
            print("  No LM Studio process found")
        print()
    
    else:
        print("  Invalid option")


if __name__ == "__main__":
    main()
