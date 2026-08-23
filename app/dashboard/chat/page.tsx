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
    <div className="relative flex h-[calc(100vh-2rem)] w-full flex-col overflow-hidden bg-canvas text-textPrimary transition-colors duration-200 font-sans rounded-[2.5rem] border border-borderCustom shadow-xl">
      
      {/* --- SPATIAL COMPUTING CSS ENGINE --- */}
      <style dangerouslySetInnerHTML={{ __html: `
        .spatial-container { perspective: 2000px; transform-style: preserve-3d; }
        
        /* Dynamic Ambient Aurora Background */
        .aurora-bg {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: 
            radial-gradient(circle at 15% 50%, rgba(29, 78, 216, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 85% 30%, rgba(16, 185, 129, 0.06) 0%, transparent 50%);
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

        /* Glass Pane (Adaptive Theme) */
        .glass-pane {
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
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
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay z-0 pointer-events-none"></div>

      {/* Top Status Bar */}
      <header className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-8 py-5 pointer-events-none">
        <div className="flex items-center gap-3 glass-pane bg-card/80 border border-borderCustom rounded-full px-4 py-1.5 shadow-sm pointer-events-auto">
          <Layers className="h-4 w-4 text-brandBlue" />
          <span className="text-xs font-bold tracking-widest text-textPrimary uppercase">Legal Neural Engine</span>
        </div>
        <div className="flex items-center gap-2 glass-pane bg-card/80 border border-borderCustom rounded-full px-3 py-1.5 shadow-sm pointer-events-auto">
          <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
          <span className="text-[10px] font-mono text-textSecondary uppercase">System Ready</span>
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
                <div className="absolute inset-0 rounded-full border border-brandBlue/20 shadow-lg transform rotateX(60deg) rotateY(20deg)"></div>
                <div className="absolute inset-4 rounded-full border border-brandBlue/30 transform rotateX(60deg) rotateY(-20deg)"></div>
                <div className="absolute inset-0 bg-gradient-to-tr from-brandBlue/10 to-transparent rounded-full backdrop-blur-md border border-borderCustom"></div>
                
                <Scale className="h-16 w-16 text-brandBlue drop-shadow-md relative z-10" strokeWidth={1.5} />
              </div>
              <h2 className="mt-12 font-serif text-4xl font-light text-textPrimary tracking-wide text-center">
                How can I guide you today?
              </h2>
              <p className="mt-3 text-sm text-textSecondary font-mono tracking-widest uppercase text-center">
                Awaiting input in 15+ Indian Languages
              </p>
            </div>
          )}

          {/* Render Messages */}
          {messages.map((msg) => (
            <div key={msg.id} className={`msg-spatial flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                /* User Bubble */
                <div className="relative max-w-[85%] sm:max-w-[70%]">
                  <div className="relative rounded-3xl rounded-tr-sm bg-brandBlue px-6 py-4 text-[15px] text-white shadow-md font-medium leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              ) : (
                /* AI Glass Panel */
                <div className="relative w-full max-w-[95%] sm:max-w-[85%] perspective-wrapper">
                  <div className="glass-pane bg-card border border-borderCustom rounded-[2rem] rounded-tl-sm p-6 sm:p-10 relative overflow-hidden shadow-sm">
                    
                    {/* Header Metadata */}
                    <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-borderCustom pb-4">
                      <div className="flex items-center gap-1.5">
                        <Fingerprint className="h-4 w-4 text-brandBlue" />
                        <span className="text-[11px] font-bold text-textSecondary uppercase tracking-widest">Verified Response</span>
                      </div>
                      
                      {msg.isDemo && (
                        <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 border border-amber-500/30">
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                          <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 uppercase tracking-widest">Demo Sandbox</span>
                        </div>
                      )}
                      
                      {msg.evidenceLevel && (
                        <div className="ml-auto">
                          <ConfidenceBadge level={msg.evidenceLevel} />
                        </div>
                      )}
                    </div>

                    {/* Rich Text Markdown */}
                    <div className="prose dark:prose-invert prose-slate max-w-none text-textPrimary prose-headings:font-serif prose-headings:font-light prose-headings:text-textPrimary prose-a:text-brandBlue prose-a:no-underline hover:prose-a:underline prose-strong:text-textPrimary prose-strong:font-semibold leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>

                    {/* Grounded Citations Vault */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-10 rounded-2xl bg-canvas p-5 border border-borderCustom">
                        <div className="mb-4 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-emerald-500" />
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Sourced Material</span>
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
              <div className="glass-pane bg-card border border-borderCustom scanner relative rounded-2xl rounded-tl-sm px-8 py-6 flex items-center gap-5 overflow-hidden shadow-sm">
                <Loader2 className="h-6 w-6 text-brandBlue animate-spin" />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold text-textPrimary tracking-wide">Synthesizing Legal Context</span>
                  <span className="text-[11px] font-mono text-textSecondary uppercase">Querying vector space database...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} className="h-10" />
        </div>
      </div>

      {/* Floating Input Dock */}
      <div className="absolute bottom-6 inset-x-0 z-40 px-4 sm:px-12 pointer-events-none spatial-container">
        <div className="mx-auto max-w-4xl pointer-events-auto">
          
          <div className="bg-card/90 backdrop-blur-xl border border-borderCustom rounded-[2rem] p-2 transition-all duration-300 shadow-lg focus-within:ring-2 focus-within:ring-brandBlue/30">
            <div className="flex items-end gap-3 rounded-[1.5rem] bg-canvas px-5 py-4 border border-borderCustom">
              
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
                className="max-h-[160px] min-h-[48px] flex-1 resize-none border-0 bg-transparent py-3 text-lg text-textPrimary placeholder:text-textSecondary focus-visible:ring-0 shadow-none scrollbar-hide font-medium"
              />
              
              <div className="flex shrink-0 items-center gap-3 pb-1">
                <div className="text-textSecondary hover:text-textPrimary transition-colors">
                  <MicButton onTranscript={(text) => setInput((prev) => (prev ? prev + " " + text : text))} />
                </div>
                
                <Button 
                  onClick={sendMessage} 
                  disabled={loading || !input.trim()}
                  className="h-12 w-12 rounded-2xl bg-brandBlue text-white hover:bg-brandBlue/90 hover:scale-105 transition-all duration-200 disabled:opacity-30 disabled:hover:scale-100 shadow-md"
                  size="icon"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
          
          <div className="mt-4 flex justify-center">
            <div className="scale-90 opacity-70 hover:opacity-100 transition-opacity">
              <Disclaimer />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}