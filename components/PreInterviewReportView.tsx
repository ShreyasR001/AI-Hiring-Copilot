
import React from 'react';
import { PreInterviewReport } from '../types';

interface Props {
  report: PreInterviewReport;
  onConfirm: () => void;
  onReset: () => void;
}

const PreInterviewReportView: React.FC<Props> = ({ report, onConfirm, onReset }) => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="bg-emerald-500/10 border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
          <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Artifact Analysis & Verification Plan</h3>
          <button onClick={onReset} className="text-[10px] text-zinc-500 hover:text-white uppercase font-bold tracking-tighter">Discard Report</button>
        </div>
        
        <div className="p-6 space-y-8">
          {/* Claimed Skills */}
          <div>
            <h4 className="text-xs font-bold text-zinc-500 uppercase mb-4 tracking-wider">Extracted Claims</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {report.claimedSkills.map((skill, i) => (
                <div key={i} className="bg-zinc-800/50 border border-zinc-700/50 p-3 rounded-xl flex justify-between items-center">
                  <div>
                    <div className="text-sm font-semibold text-zinc-200">{skill.name}</div>
                    <div className="text-[10px] text-zinc-500">{skill.level}</div>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                    skill.evidenceStrength === 'Strong' ? 'bg-emerald-500/20 text-emerald-400' :
                    skill.evidenceStrength === 'Moderate' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {skill.evidenceStrength.toUpperCase()} EVIDENCE
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Verification Plan */}
          <div>
            <h4 className="text-xs font-bold text-zinc-500 uppercase mb-3 tracking-wider text-emerald-500">Verification Strategy</h4>
            <p className="text-sm text-zinc-300 leading-relaxed bg-zinc-950/50 p-4 rounded-xl border border-zinc-800 italic">
              {report.verificationPlan}
            </p>
          </div>

          {/* Probing Questions */}
          <div>
            <h4 className="text-xs font-bold text-zinc-500 uppercase mb-3 tracking-wider">Targeted Probing Questions</h4>
            <ul className="space-y-2">
              {report.targetedQuestions.map((q, i) => (
                <li key={i} className="flex gap-3 text-sm text-zinc-400 bg-black/30 p-3 rounded-lg border border-zinc-800/50">
                  <span className="text-emerald-500 font-mono font-bold">Q{i+1}</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={onConfirm}
          className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-bold text-lg shadow-lg transition-all active:scale-95 flex items-center gap-3"
        >
          Begin Verification Interview
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
        </button>
      </div>
    </div>
  );
};

export default PreInterviewReportView;
