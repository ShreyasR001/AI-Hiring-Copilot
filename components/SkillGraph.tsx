
import React from 'react';
import { SkillGraphData, SkillDepth } from '../types';

interface SkillGraphProps {
  data: SkillGraphData;
}

const depthMap: Record<SkillDepth, number> = {
  'None': 0,
  'Basic': 1,
  'Intermediate': 2,
  'Advanced': 3
};

const SkillGraph: React.FC<SkillGraphProps> = ({ data }) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Visual Skills Matrix */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Skill Depth Matrix</h3>
          <div className="space-y-6">
            {data.skills.map((skill, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-white font-medium">{skill.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    skill.depth === 'Advanced' ? 'bg-emerald-500/20 text-emerald-400' :
                    skill.depth === 'Intermediate' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    {skill.depth.toUpperCase()}
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex gap-1">
                  {[1, 2, 3].map((step) => (
                    <div 
                      key={step}
                      className={`h-full flex-1 transition-all duration-1000 delay-${i * 100} ${
                        step <= depthMap[skill.depth] 
                          ? (skill.depth === 'Advanced' ? 'bg-emerald-500' : 'bg-blue-500') 
                          : 'bg-zinc-700/30'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hiring Summary */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Final Assessment</h3>
            <div className={`text-3xl font-bold mb-2 ${
              data.hiringRecommendation === 'Hire' ? 'text-emerald-500' :
              data.hiringRecommendation === 'Borderline' ? 'text-amber-500' : 'text-red-500'
            }`}>
              {data.hiringRecommendation.toUpperCase()}
            </div>
            <div className="text-zinc-400 text-sm">
              Decision Confidence: {(data.confidenceScore * 100).toFixed(0)}%
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-zinc-800">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase mb-3">Detected Risk Signals</h4>
            <div className="space-y-2">
              {data.riskSignals.length > 0 ? data.riskSignals.map((risk, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                    risk.severity === 'high' ? 'bg-red-500' :
                    risk.severity === 'medium' ? 'bg-amber-500' : 'bg-zinc-500'
                  }`} />
                  <span className="text-zinc-300">{risk.description}</span>
                </div>
              )) : (
                <div className="text-xs text-zinc-600 italic">No significant risks identified.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Evidence Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-800/20">
          <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Evidence & Justification</h3>
        </div>
        <div className="divide-y divide-zinc-800">
          {data.skills.map((skill, i) => (
            <div key={i} className="px-6 py-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="font-bold text-white text-sm">{skill.name}</div>
              <div className="md:col-span-3 text-sm text-zinc-400 leading-relaxed italic">
                "{skill.evidence}"
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SkillGraph;
