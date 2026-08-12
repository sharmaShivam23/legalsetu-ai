"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Scale, Sparkles, AlertTriangle, Fingerprint, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MicButton } from "@/components/voice/mic-button";
import { ConfidenceBadge } from "@/components/chat/confidence-badge";
import { CitationCard } from "@/components/chat/citation-card";
import { Disclaimer } from "@/components/common/disclaimer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidenceLevel?: "STRONG" | "MODERATE" | "LIMITED" | "INSUFFICIENT";
  citations?: any[];
  isDemo?: boolean;
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg.content, language: "en" }),
      });
      const data = await res.json();

      if (data.success) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.data.answer,
            evidenceLevel: data.data.evidenceLevel,
            citations: data.data.citations,
            isDemo: data.data.isDemo,
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `⚠️ ${data.error?.message ?? "Something went wrong."}`,
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex h-[calc(100vh-2rem)] w-full flex-col overflow-hidden bg-[#020617] font-sans selection:bg-brand-500/30 selection:text-white rounded-[2.5rem] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
      
      {/* --- SPATIAL COMPUTING CSS ENGINE --- */}
      <style dangerouslySetInnerHTML={{ __html: `
        .spatial-container { perspective: 2000px; transform-style: preserve-3d; }
        
        /* Ambient Aurora Background */
        .aurora-bg {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: 
            radial-gradient(circle at 15% 50%, rgba(29, 78, 216, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 85% 30%, rgba(16, 185, 129, 0.1) 0%, transparent 50%);
          filter: blur(60px);
          animation: aurora-shift 20s ease-in-out infinite alternate;
          pointer-events: none;
          z-index: 0;
        }
        @keyframes aurora-shift {
          0% { transform: scale(1) translate(0, 0); }
          100% { transform: scale(1.1) translate(-20px, 20px); }
        }

        /* 3D Message Unfold Animation */
        @keyframes unfold3D {
          0% { opacity: 0; transform: translateY(60px) translateZ(-200px) rotateX(-25deg) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) translateZ(0) rotateX(0deg) scale(1); }
        }
        .msg-spatial {
          animation: unfold3D 0.8s cubic-bezier(0.19, 1, 0.22, 1) forwards;
          transform-origin: center bottom;
          will-change: transform, opacity;
        }

        /* Glass Pane (VisionOS Style) */
        .glass-pane {
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-top: 1px solid rgba(255, 255, 255, 0.25);
          box-shadow: 
            0 25px 50px -12px rgba(0, 0, 0, 0.5), 
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        /* 3D Input Console */
        .input-console {
          background: rgba(2, 6, 23, 0.7);
          backdrop-filter: blur(30px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 -20px 40px -10px rgba(0,0,0,0.5), inset 0 2px 20px rgba(255,255,255,0.02);
          transform: translateZ(50px);
        }

        /* Scanning Line for Loading */
        @keyframes scan-line {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .scanner::after {
          content: ''; position: absolute; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.8), transparent);
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.6);
          animation: scan-line 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          z-index: 10;
        }

        /* Floating Empty State */
        @keyframes float-complex {
          0%, 100% { transform: translateY(0) rotateX(10deg) rotateY(-10deg); }
          50% { transform: translateY(-15px) rotateX(15deg) rotateY(-5deg); }
        }
        .core-float { animation: float-complex 8s ease-in-out infinite; transform-style: preserve-3d; }
      `}} />

      <div className="aurora-bg"></div>
      
      {/* Grid Overlay */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04] mix-blend-overlay z-0 pointer-events-none"></div>

      {/* Top Status Bar */}
      <header className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-8 py-5 pointer-events-none">
        <div className="flex items-center gap-3 glass-pane rounded-full px-4 py-1.5 pointer-events-auto">
          <Layers className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-bold tracking-widest text-white uppercase">Legal Neural Engine</span>
        </div>
        <div className="flex items-center gap-2 glass-pane rounded-full px-3 py-1.5 pointer-events-auto">
          <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
          <span className="text-[10px] font-mono text-slate-300 uppercase">System Ready</span>
        </div>
      </header>

      {/* Main Chat Area */}
      <div className="spatial-container flex-1 overflow-y-auto px-4 sm:px-12 pt-28 pb-48 z-10 scrollbar-hide">
        <div className="mx-auto max-w-4xl space-y-10 flex flex-col">
          
          {/* Spatial Empty State */}
          {messages.length === 0 && (
            <div className="mt-24 flex flex-col items-center justify-center">
              <div className="core-float relative flex h-40 w-40 items-center justify-center">
                {/* 3D Rings */}
                <div className="absolute inset-0 rounded-full border border-blue-500/20 shadow-[0_0_40px_rgba(59,130,246,0.1)] transform rotateX(60deg) rotateY(20deg)"></div>
                <div className="absolute inset-4 rounded-full border border-indigo-400/30 shadow-[inset_0_0_20px_rgba(99,102,241,0.2)] transform rotateX(60deg) rotateY(-20deg)"></div>
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-900/40 to-transparent rounded-full backdrop-blur-md border border-white/10"></div>
                
                <Scale className="h-16 w-16 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] relative z-10" strokeWidth={1} />
              </div>
              <h2 className="mt-12 font-serif text-4xl font-light text-white tracking-wide">
                How can I guide you today?
              </h2>
              <p className="mt-3 text-sm text-slate-400 font-mono tracking-widest uppercase">
                Awaiting input in 15+ Indian Languages
              </p>
            </div>
          )}

          {/* Render Messages */}
          {messages.map((msg) => (
            <div key={msg.id} className={`msg-spatial flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                // User Spatial Bubble: Solid, clean, elevated
                <div className="relative max-w-[85%] sm:max-w-[70%]">
                  <div className="absolute inset-0 bg-white rounded-3xl blur-md opacity-20 translate-y-2 translate-z-[-10px]"></div>
                  <div className="relative rounded-3xl rounded-tr-sm bg-slate-100 px-6 py-4 text-[15px] text-slate-900 shadow-2xl font-medium leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              ) : (
                // AI Spatial Glass Panel
                <div className="relative w-full max-w-[95%] sm:max-w-[85%] perspective-wrapper">
                  <div className="glass-pane rounded-[2rem] rounded-tl-sm p-6 sm:p-10 relative overflow-hidden transform-gpu">
                    
                    {/* Header Metadata */}
                    <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-white/10 pb-4">
                      <div className="flex items-center gap-1.5">
                        <Fingerprint className="h-4 w-4 text-blue-400" />
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Verified Response</span>
                      </div>
                      
                      {msg.isDemo && (
                        <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 border border-amber-500/30">
                          <AlertTriangle className="h-3 w-3 text-amber-400" />
                          <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest">Demo Sandbox</span>
                        </div>
                      )}
                      
                      {msg.evidenceLevel && (
                        <div className="ml-auto">
                          <ConfidenceBadge level={msg.evidenceLevel} />
                        </div>
                      )}
                    </div>

                    {/* Rich Text Markdown */}
                    <div className="prose prose-invert prose-lg max-w-none text-slate-200 prose-headings:font-serif prose-headings:font-light prose-headings:text-white prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-white prose-strong:font-semibold leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>

                    {/* Grounded Citations Vault */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-10 rounded-2xl bg-black/40 p-5 border border-white/5">
                        <div className="mb-4 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-emerald-400" />
                          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">Sourced Material</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {msg.citations.map((c: any) => (
                            <CitationCard key={c.chunkId} citation={c} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Advanced Processing State */}
          {loading && (
            <div className="msg-spatial flex justify-start w-full max-w-[85%]">
              <div className="glass-pane scanner relative rounded-2xl rounded-tl-sm px-8 py-6 flex items-center gap-5 overflow-hidden">
                <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold text-white tracking-wide">Synthesizing Legal Context</span>
                  <span className="text-[11px] font-mono text-slate-400 uppercase">Querying vector space database...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} className="h-10" />
        </div>
      </div>

      {/* Floating 3D Input Dock */}
      <div className="absolute bottom-6 inset-x-0 z-40 px-4 sm:px-12 pointer-events-none spatial-container">
        <div className="mx-auto max-w-4xl pointer-events-auto">
          
          <div className="input-console rounded-[2rem] p-2 transition-all duration-500 focus-within:shadow-[0_-20px_50px_-10px_rgba(59,130,246,0.3)] focus-within:border-blue-500/30">
            <div className="flex items-end gap-3 rounded-[1.5rem] bg-black/50 px-5 py-4 border border-white/5">
              
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type your legal scenario..."
                rows={1}
                className="max-h-[160px] min-h-[48px] flex-1 resize-none border-0 bg-transparent py-3 text-lg text-white placeholder:text-slate-500 focus-visible:ring-0 shadow-none scrollbar-hide font-medium"
              />
              
              <div className="flex shrink-0 items-center gap-3 pb-1">
                <div className="text-slate-400 hover:text-white transition-colors">
                  <MicButton onTranscript={(text) => setInput((prev) => (prev ? prev + " " + text : text))} />
                </div>
                
                <Button 
                  onClick={sendMessage} 
                  disabled={loading || !input.trim()}
                  className="h-12 w-12 rounded-2xl bg-white text-slate-900 hover:bg-blue-400 hover:text-white hover:scale-105 hover:shadow-[0_0_20px_rgba(96,165,250,0.6)] transition-all duration-300 disabled:opacity-30 disabled:hover:scale-100 disabled:hover:shadow-none"
                  size="icon"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
          
          <div className="mt-4 flex justify-center">
             <div className="scale-90 opacity-60 hover:opacity-100 transition-opacity">
               <Disclaimer />
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}