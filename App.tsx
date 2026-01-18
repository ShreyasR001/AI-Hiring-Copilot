
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type } from '@google/genai';
import { InterviewRole, Message, InterviewStatus, SkillGraphData, PreInterviewReport } from './types';
import { decode, decodeAudioData, createBlob } from './utils/audio';
import Waveform from './components/Waveform';
import SkillGraph from './components/SkillGraph';
import PreInterviewReportView from './components/PreInterviewReportView';

const ROLES: InterviewRole[] = [
  { id: 'swe', title: 'Software Engineer', description: 'General software development, data structures, and algorithms.' },
  { id: 'ai', title: 'AI/ML Engineer', description: 'Machine learning fundamentals, LLMs, and neural networks.' },
  { id: 'frontend', title: 'Senior Frontend React Engineer', description: 'Advanced UI/UX, React patterns, and performance.' },
  { id: 'backend', title: 'Backend Systems Architect', description: 'Scalability, distributed systems, and databases.' }
];

const SYSTEM_PROMPT = `You are an AI Hiring Copilot conducting first-round technical screening interviews for software, AI, and engineering roles.
You behave like a calm, senior technical interviewer, not a tutor and not a chatbot.
Assess real skill depth, detect resume inflation, adapt questions in real time, and produce explainable hiring reasoning.
Do not be friendly or motivational. Be professional, neutral, and precise.

STYLE RULES:
- Ask one question at a time.
- Increase difficulty only if the candidate performs well.
- If an answer is vague, ask a probing follow-up.
- Never give hints or explain answers.
- Never praise or criticize.

FIRST MESSAGE RULE:
When the interview starts, say only: “We will begin the technical screening. Please answer concisely and clearly.” Then ask the first role-appropriate question.

END-OF-INTERVIEW SUMMARY:
Only when explicitly asked to summarize, output in the requested internal format.`;

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

  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Live API Session
  const sessionRef = useRef<any>(null);

  const analyzeArtifacts = async () => {
    if (!resumeText.trim()) {
      setError("Resume text is mandatory for artifact analysis.");
      return;
    }
    setIsPreprocessing(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const prompt = `Analyze the following candidate artifacts for a ${selectedRole?.title} position.
      - Resume: ${resumeText}
      - GitHub: ${githubLink || 'Not provided'}
      
      Extract claimed skills, assess evidence strength (Strong/Moderate/Weak), and generate a verification plan with targeted probing questions.`;

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

      const report = JSON.parse(response.text || '{}');
      setPreInterviewReport(report);
    } catch (err: any) {
      console.error(err);
      setError("Artifact analysis failed. Please try again or skip to interview.");
    } finally {
      setIsPreprocessing(false);
    }
  };

  const startInterview = async () => {
    if (!selectedRole) return;
    
    setStatus(InterviewStatus.CONNECTING);
    setSkillGraph(null);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let instruction = `${SYSTEM_PROMPT}\n\nToday you are interviewing for the position: ${selectedRole.title}. ${selectedRole.description}`;
      if (preInterviewReport) {
        instruction += `\n\nCANDIDATE CLAIMS & VERIFICATION PLAN:
        ${preInterviewReport.verificationPlan}
        
        USE THESE TARGETED QUESTIONS IF APPROPRIATE:
        ${preInterviewReport.targetedQuestions.join('\n- ')}
        
        EXTRACTED SKILLS TO VERIFY:
        ${preInterviewReport.claimedSkills.map(s => `${s.name} (${s.level}) - Evidence: ${s.evidenceStrength}`).join('\n')}`;
      }

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: instruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus(InterviewStatus.ACTIVE);
            
            // Stream audio from mic
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
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
              source.addEventListener('ended', () => {
                activeSourcesRef.current.delete(source);
                if (activeSourcesRef.current.size === 0) setIsModelTalking(false);
              });
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              activeSourcesRef.current.add(source);
            }

            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              updateTranscript('interviewer', text);
            } else if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              updateTranscript('candidate', text);
            }

            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => s.stop());
              activeSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsModelTalking(false);
            }
          },
          onerror: (e) => {
            console.error('Gemini Live API Error:', e);
            setError("Communication lost. Please try reconnecting.");
            endInterview();
          },
          onclose: () => {
            setStatus(InterviewStatus.ENDED);
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to start interview. Check microphone permissions.");
      setStatus(InterviewStatus.IDLE);
    }
  };

  const endInterview = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
    }
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
      sessionRef.current.sendRealtimeInput({
        text: "Please provide the end-of-interview summary now as per your instructions."
      });
    }
  };

  const analyzeSkillGraph = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const prompt = `Analyze the following interview transcript for the role of ${selectedRole?.title}. 
      Extract a structured skill graph including:
      1. Skills demonstrated
      2. Observed depth (None, Basic, Intermediate, Advanced)
      3. Specific evidence from the transcript
      4. Risk signals (Resume inflation, inconsistencies)
      5. Final hiring recommendation

      TRANSCRIPT:
      ${transcript.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n')}
      `;

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

      const data = JSON.parse(response.text || '{}');
      setSkillGraph(data);
    } catch (err: any) {
      console.error(err);
      setError("Failed to generate skill graph. Transcript may be too short or invalid.");
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
            <h1 className="text-xl font-semibold text-white tracking-tight">Hiring Copilot <span className="text-zinc-500 text-sm font-normal ml-2">Internal Assessment v2.5</span></h1>
          </div>
          <div className="flex items-center gap-4">
            {status === InterviewStatus.ACTIVE && (
              <div className="flex items-center gap-2 bg-zinc-800 px-3 py-1 rounded-full text-xs font-mono">
                <div className="pulse"></div>
                LIVE SESSION
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
              <p className="text-zinc-500 max-w-xl mx-auto">Select a candidate role profile and provide artifacts for artifact-driven verification.</p>
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
                   <button 
                    onClick={() => setSkillGraph(null)}
                    className="text-sm text-zinc-500 hover:text-white"
                   >
                     Back to Transcript
                   </button>
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
                  <button 
                    onClick={endInterview}
                    className="text-xs text-red-500 hover:bg-red-500/10 px-3 py-1 rounded transition-colors"
                  >
                    TERMINATE
                  </button>
                </div>

                <div className="text-center mb-8">
                  <div className="text-zinc-500 text-sm font-mono mb-2">TARGET ROLE: {selectedRole?.title}</div>
                  {status === InterviewStatus.CONNECTING ? (
                    <div className="text-xl animate-pulse text-zinc-400">Initializing Audio Core...</div>
                  ) : (
                    <Waveform isActive={status === InterviewStatus.ACTIVE} isModelTalking={isModelTalking} />
                  )}
                </div>

                <div className="bg-black/50 rounded-2xl p-6 h-[400px] overflow-y-auto border border-zinc-800 space-y-4 custom-scrollbar">
                  {transcript.length === 0 && status === InterviewStatus.ACTIVE && (
                    <p className="text-zinc-600 italic text-center py-20">Waiting for agent to speak...</p>
                  )}
                  {transcript.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'interviewer' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        m.role === 'interviewer' 
                          ? 'bg-zinc-800 text-zinc-200 rounded-tl-none' 
                          : 'bg-emerald-700/30 text-emerald-100 border border-emerald-800/50 rounded-tr-none'
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
                    <button 
                      onClick={requestEvaluation}
                      className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg font-bold border border-zinc-700 transition-colors"
                    >
                      REQUEST SUMMARY
                    </button>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-900/20 border border-red-500/50 text-red-400 rounded-xl text-center">
                {error}
              </div>
            )}

            {status === InterviewStatus.ENDED && !skillGraph && (
              <div className="flex flex-col items-center gap-4">
                <p className="text-zinc-500">Session terminated safely.</p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setTranscript([]);
                      setStatus(InterviewStatus.IDLE);
                      setPreInterviewReport(null);
                    }}
                    className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                  >
                    Return to Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center text-[10px] text-zinc-600 uppercase tracking-[0.2em] bg-black/80 backdrop-blur-sm pointer-events-none">
        Internal Proprietary AI Tool • Authorized Access Only
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #3f3f46;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};

export default App;
