
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type } from '@google/genai';
import { InterviewRole, Message, InterviewStatus, SkillGraphData, PreInterviewReport } from './types.ts';
import { decode, decodeAudioData, createBlob } from './utils/audio.ts';
import Waveform from './components/Waveform.tsx';
import SkillGraph from './components/SkillGraph.tsx';
import PreInterviewReportView from './components/PreInterviewReportView.tsx';

const ROLES: InterviewRole[] = [
  { id: 'swe', title: 'Software Engineer', description: 'General software development, data structures, and algorithms.' },
  { id: 'ai', title: 'AI/ML Engineer', description: 'Machine learning fundamentals, LLMs, and neural networks.' },
  { id: 'frontend', title: 'Senior Frontend React Engineer', description: 'Advanced UI/UX, React patterns, and performance.' },
  { id: 'backend', title: 'Backend Systems Architect', description: 'Scalability, distributed systems, and databases.' }
];

const SYSTEM_PROMPT = `You are a world-class AI Hiring Copilot and Technical Screening Agent.
Your objective is to conduct high-fidelity technical interviews with extreme precision.

STRICT ENGLISH PROTOCOL:
- INTERACTION: YOU MUST ONLY SPEAK ENGLISH.
- TRANSCRIPTION: YOU MUST ONLY TRANSCRIBE IN ENGLISH.
- If the candidate speaks a language other than English, DO NOT TRANSCRIBE the foreign words. Instead, output the transcription: "[Non-English speech detected]" and verbally remind the candidate: "Please continue the interview in English only."
- TECHNICAL LEXICON: Recognize jargon: "Kubernetes", "Microservices", "Concurrency", "TypeScript", "React Hooks", "B-Trees", "Dijkstra", "CI/CD", "Idempotency", "Normalization", etc.
- ACCENT ROBUSTNESS: You are highly trained in understanding global English accents. Focus on the semantic technical meaning.

VTT & AUDIO PROCESSING:
- NOISE REJECTION: Ignore non-verbal sounds: keyboard clicks, sirens, or background chatter.
- STYLE: One question at a time. Professional, objective, and neutral senior engineer persona.
- Probing follow-ups only. No hints, no fillers, no validation.

FIRST MESSAGE: "Technical screening initialized. Note: This terminal strictly processes English only. Please answer all questions in technical English. We will begin now." Followed immediately by the first question based on the role or resume.`;

const App: React.FC = () => {
  const [status, setStatus] = useState<InterviewStatus>(InterviewStatus.IDLE);
  const [selectedRole, setSelectedRole] = useState<InterviewRole | null>(null);
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [isModelTalking, setIsModelTalking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [skillGraph, setSkillGraph] = useState<SkillGraphData | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [githubLink, setGithubLink] = useState('');
  const [preInterviewReport, setPreInterviewReport] = useState<PreInterviewReport | null>(null);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const analyzeArtifacts = async () => {
    if (!resumeText.trim()) {
      setError("Resume text is mandatory for artifact analysis.");
      return;
    }
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      setError("API Key missing. Please check your environment.");
      return;
    }
    setIsPreprocessing(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Analyze artifacts for ${selectedRole?.title}:
      Resume: ${resumeText}
      GitHub: ${githubLink || 'N/A'}
      Extract skills, evidence strength, and generate verification plan in English.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              claimedSkills: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    level: { type: Type.STRING },
                    evidenceStrength: { type: Type.STRING, enum: ['Strong', 'Moderate', 'Weak'] }
                  },
                  required: ['name', 'level', 'evidenceStrength']
                }
              },
              verificationPlan: { type: Type.STRING },
              targetedQuestions: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['claimedSkills', 'verificationPlan', 'targetedQuestions']
          }
        }
      });

      setPreInterviewReport(JSON.parse(response.text || '{}'));
    } catch (err: any) {
      setError("Analysis failed. Proceeding without report.");
    } finally {
      setIsPreprocessing(false);
    }
  };

  const startInterview = async () => {
    if (!selectedRole) return;
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      setError("Critical Error: API Key not detected.");
      return;
    }

    setStatus(InterviewStatus.CONNECTING);
    setError(null);

    try {
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await inputAudioContextRef.current.resume();
      await outputAudioContextRef.current.resume();

      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ai = new GoogleGenAI({ apiKey });

      let instruction = `${SYSTEM_PROMPT}\nTarget Role: ${selectedRole.title}. ${selectedRole.description}`;
      if (preInterviewReport) {
        instruction += `\nVerification Plan: ${preInterviewReport.verificationPlan}\nProbing Questions: ${preInterviewReport.targetedQuestions.join(', ')}`;
      }

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: instruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus(InterviewStatus.ACTIVE);
            const source = inputAudioContextRef.current!.createMediaStreamSource(streamRef.current!);
            
            const compressor = inputAudioContextRef.current!.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-50, inputAudioContextRef.current!.currentTime);
            compressor.knee.setValueAtTime(40, inputAudioContextRef.current!.currentTime);
            compressor.ratio.setValueAtTime(12, inputAudioContextRef.current!.currentTime);
            compressor.attack.setValueAtTime(0, inputAudioContextRef.current!.currentTime);
            compressor.release.setValueAtTime(0.25, inputAudioContextRef.current!.currentTime);

            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (sessionRef.current) {
                const inputData = e.inputBuffer.getChannelData(0);
                sessionRef.current.sendRealtimeInput({ media: createBlob(inputData) });
              }
            };
            
            source.connect(compressor);
            compressor.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setIsModelTalking(true);
              const ctx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.onended = () => {
                activeSourcesRef.current.delete(source);
                if (activeSourcesRef.current.size === 0) setIsModelTalking(false);
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              activeSourcesRef.current.add(source);
            }

            if (message.serverContent?.outputTranscription) {
              updateTranscript('interviewer', message.serverContent.outputTranscription.text);
            } else if (message.serverContent?.inputTranscription) {
              updateTranscript('candidate', message.serverContent.inputTranscription.text);
            }

            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              activeSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsModelTalking(false);
            }
          },
          onerror: (e) => {
            console.error("Gemini Error:", e);
            setError("Connection Error. The session has been interrupted.");
            endInterview();
          },
          onclose: () => setStatus(InterviewStatus.ENDED)
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      setError(err.message || "Failed to initialize interview terminal.");
      setStatus(InterviewStatus.IDLE);
    }
  };

  const endInterview = () => {
    if (sessionRef.current) sessionRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    sessionRef.current = null;
    setStatus(InterviewStatus.ENDED);
  };

  const updateTranscript = (role: 'interviewer' | 'candidate', text: string) => {
    setTranscript(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && (Date.now() - last.timestamp < 3000)) {
        return [...prev.slice(0, -1), { ...last, text: last.text + ' ' + text }];
      }
      return [...prev, { role, text, timestamp: Date.now() }];
    });
  };

  const requestEvaluation = () => {
    if (sessionRef.current) {
      sessionRef.current.sendRealtimeInput({ text: "Provide the interview summary now based on our conversation." });
    }
  };

  const analyzeSkillGraph = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const prompt = `Graph Analysis for ${selectedRole?.title}:\n${transcript.map(m => `${m.role}: ${m.text}`).join('\n')}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              skills: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    depth: { type: Type.STRING, enum: ['None', 'Basic', 'Intermediate', 'Advanced'] },
                    evidence: { type: Type.STRING },
                    confidence: { type: Type.NUMBER }
                  },
                  required: ['name', 'depth', 'evidence', 'confidence']
                }
              },
              riskSignals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    severity: { type: Type.STRING, enum: ['low', 'medium', 'high'] }
                  },
                  required: ['description', 'severity']
                }
              },
              hiringRecommendation: { type: Type.STRING, enum: ['Hire', 'Borderline', 'No Hire'] },
              confidenceScore: { type: Type.NUMBER }
            },
            required: ['skills', 'riskSignals', 'hiringRecommendation', 'confidenceScore']
          }
        }
      });
      setSkillGraph(JSON.parse(response.text || '{}'));
    } catch (err: any) {
      setError("Analysis failed. Sample size might be too small.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-black text-zinc-300 pb-20">
      <header className="w-full border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-md flex items-center justify-center font-bold text-black">C</div>
            <h1 className="text-xl font-semibold text-white tracking-tight">Hiring Copilot <span className="text-zinc-500 text-sm font-normal ml-2 text-[10px] bg-zinc-800 px-2 py-0.5 rounded uppercase">ENGLISH ONLY</span></h1>
          </div>
          <div className="flex items-center gap-4">
            {status === InterviewStatus.ACTIVE && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-zinc-800 px-3 py-1 rounded-full text-[10px] font-mono border border-zinc-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                  STRICT VTT
                </div>
                <div className="flex items-center gap-2 bg-zinc-800 px-3 py-1 rounded-full text-xs font-mono">
                  <div className="pulse"></div>
                  LIVE SESSION
                </div>
              </div>
            )}
            <div className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Confidential</div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl px-6 py-12">
        {status === InterviewStatus.IDLE && !preInterviewReport && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold text-white tracking-tight">Technical Screening Terminal</h2>
              <p className="text-zinc-500 max-w-xl mx-auto italic">Strict English technical screening with accent robustness and background noise rejection.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ROLES.map(role => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role)}
                  className={`p-6 text-left border rounded-xl transition-all ${
                    selectedRole?.id === role.id 
                      ? 'bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500' 
                      : 'bg-zinc-900/30 border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <h3 className="text-lg font-bold text-white mb-1">{role.title}</h3>
                  <p className="text-sm text-zinc-400">{role.description}</p>
                </button>
              ))}
            </div>

            {selectedRole && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-6 animate-in slide-in-from-top-2">
                 <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Pre-Interview Artifacts</h3>
                 <div className="space-y-4">
                   <div className="space-y-2">
                     <label className="text-[10px] font-bold text-zinc-600 uppercase">Resume Content (Required)</label>
                     <textarea
                       placeholder="Paste full resume text here..."
                       value={resumeText}
                       onChange={(e) => setResumeText(e.target.value)}
                       className="w-full h-32 bg-black border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-700 font-mono"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[10px] font-bold text-zinc-600 uppercase">GitHub / Portfolio URL (Optional)</label>
                     <input
                       type="text"
                       placeholder="https://github.com/username"
                       value={githubLink}
                       onChange={(e) => setGithubLink(e.target.value)}
                       className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-700"
                     />
                   </div>
                 </div>
                 <div className="flex gap-4">
                    <button
                      disabled={isPreprocessing || !resumeText.trim()}
                      onClick={analyzeArtifacts}
                      className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      {isPreprocessing ? 'Processing Artifacts...' : 'Analyze & Build Verification Plan'}
                    </button>
                    <button
                      onClick={startInterview}
                      className="px-6 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold transition-all border border-zinc-700"
                    >
                      Skip to Interview
                    </button>
                 </div>
              </div>
            )}
          </div>
        )}

        {preInterviewReport && status === InterviewStatus.IDLE && (
          <PreInterviewReportView 
            report={preInterviewReport} 
            onConfirm={startInterview} 
            onReset={() => setPreInterviewReport(null)}
          />
        )}

        {(status === InterviewStatus.ACTIVE || status === InterviewStatus.CONNECTING || status === InterviewStatus.ENDED) && (
          <div className="space-y-8 w-full">
            {skillGraph ? (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                   <h2 className="text-2xl font-bold text-white">Skill Graph Analysis</h2>
                   <button onClick={() => setSkillGraph(null)} className="text-sm text-zinc-500 hover:text-white">Back to Transcript</button>
                </div>
                <SkillGraph data={skillGraph} />
              </div>
            ) : (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 shadow-2xl overflow-hidden relative">
                <div className="absolute top-0 right-0 p-4 flex gap-2">
                  {status === InterviewStatus.ENDED && (
                    <button 
                      onClick={analyzeSkillGraph}
                      disabled={isAnalyzing || transcript.length < 2}
                      className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      {isAnalyzing ? 'Analyzing...' : 'Analyze Skill Graph'}
                    </button>
                  )}
                  <button onClick={endInterview} className="text-xs text-red-500 hover:bg-red-500/10 px-3 py-1 rounded transition-colors">TERMINATE</button>
                </div>

                <div className="text-center mb-8">
                  <div className="text-zinc-500 text-sm font-mono mb-2 uppercase tracking-tighter">Target: {selectedRole?.title}</div>
                  {status === InterviewStatus.CONNECTING ? (
                    <div className="text-xl animate-pulse text-zinc-400">Syncing Neural Link...</div>
                  ) : (
                    <Waveform isActive={status === InterviewStatus.ACTIVE} isModelTalking={isModelTalking} />
                  )}
                </div>

                <div className="bg-black/50 rounded-2xl p-6 h-[400px] overflow-y-auto border border-zinc-800 space-y-4 custom-scrollbar">
                  {transcript.length === 0 && status === InterviewStatus.ACTIVE && (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
                        <span className="text-zinc-500 font-mono text-sm">STRICT ENGLISH VTT ACTIVE</span>
                      </div>
                      <p className="text-zinc-600 italic text-center">Waiting for agent to speak...</p>
                    </div>
                  )}
                  {transcript.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'interviewer' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        m.role === 'interviewer' ? 'bg-zinc-800 text-zinc-200 rounded-tl-none shadow-lg' : 'bg-emerald-700/30 text-emerald-100 border border-emerald-800/50 rounded-tr-none shadow-md'
                      }`}>
                        <div className="text-[10px] uppercase font-bold opacity-50 mb-1">{m.role}</div>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</div>
                      </div>
                    </div>
                  ))}
                  <div id="anchor"></div>
                </div>

                <div className="mt-8 flex justify-between items-center">
                   <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isModelTalking ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6]' : 'bg-zinc-700'}`}></div>
                    <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                      {isModelTalking ? 'Agent Transmitting' : 'Awaiting Input'}
                    </span>
                  </div>

                  {status === InterviewStatus.ACTIVE && (
                    <div className="flex items-center gap-4">
                      <div className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1.5 px-3 py-1 bg-emerald-500/5 rounded-full border border-emerald-500/20">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        English Enforcement: Active
                      </div>
                      <button onClick={requestEvaluation} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg font-bold border border-zinc-700 transition-colors">REQUEST SUMMARY</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-900/20 border border-red-500/50 text-red-400 rounded-xl text-center animate-bounce shadow-xl">
                {error}
              </div>
            )}

            {status === InterviewStatus.ENDED && !skillGraph && (
              <div className="flex flex-col items-center gap-4">
                <p className="text-zinc-500">Session terminated safely.</p>
                <button onClick={() => { setTranscript([]); setStatus(InterviewStatus.IDLE); setPreInterviewReport(null); }} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">Return to Dashboard</button>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center text-[10px] text-zinc-600 uppercase tracking-[0.2em] bg-black/80 backdrop-blur-sm pointer-events-none">
        Internal Proprietary AI Tool • Authorized Access Only
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
