
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SkillGraphData, SkillEntry, SkillDepth } from '../types';

interface SkillGraphProps {
  data: SkillGraphData;
}

interface Node extends SkillEntry {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const DEPTH_COLORS: Record<SkillDepth, string> = {
  'Advanced': '#10b981', // Emerald
  'Intermediate': '#3b82f6', // Blue
  'Basic': '#71717a', // Zinc
  'None': '#3f3f46'
};

const SkillGraph: React.FC<SkillGraphProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const requestRef = useRef<number>(0);

  // Initialize simulation nodes
  useEffect(() => {
    const width = containerRef.current?.offsetWidth || 600;
    const height = 400;
    
    const initialNodes: Node[] = data.skills.map((skill, i) => ({
      ...skill,
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 100,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      radius: 30 + (skill.confidence * 20)
    }));
    
    setNodes(initialNodes);

    const animate = () => {
      setNodes(prevNodes => {
        const nextNodes = prevNodes.map(node => ({ ...node }));
        const centerX = width / 2;
        const centerY = height / 2;
        const friction = 0.95;
        const gravity = 0.05;
        const repulsion = 1500;

        for (let i = 0; i < nextNodes.length; i++) {
          const a = nextNodes[i];
          
          // Attraction to center
          a.vx += (centerX - a.x) * gravity * 0.1;
          a.vy += (centerY - a.y) * gravity * 0.1;

          // Repulsion from other nodes
          for (let j = i + 1; j < nextNodes.length; j++) {
            const b = nextNodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = repulsion / (distance * distance);
            const nx = dx / distance;
            const ny = dy / distance;

            a.vx -= nx * force;
            a.vy -= ny * force;
            b.vx += nx * force;
            b.vy += ny * force;
          }

          // Apply physics
          a.x += a.vx;
          a.y += a.vy;
          a.vx *= friction;
          a.vy *= friction;

          // Constraints
          a.x = Math.max(a.radius, Math.min(width - a.radius, a.x));
          a.y = Math.max(a.radius, Math.min(height - a.radius, a.y));
        }
        return nextNodes;
      });
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [data.skills]);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Interactive Graph Area */}
        <div 
          ref={containerRef}
          className="lg:col-span-2 bg-zinc-950 border border-zinc-800 rounded-3xl relative overflow-hidden h-[500px] group shadow-inner"
        >
          <div className="absolute top-4 left-6 z-10">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Live Skill Topology</h3>
            <p className="text-[9px] text-zinc-600">Interactively explored candidate depth</p>
          </div>

          <svg className="w-full h-full cursor-crosshair">
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            
            {/* Background connection lines to center */}
            {nodes.map((node, i) => (
              <line 
                key={`line-${i}`}
                x1={containerRef.current?.offsetWidth ? containerRef.current.offsetWidth / 2 : 300}
                y1={250}
                x2={node.x}
                y2={node.y}
                stroke={DEPTH_COLORS[node.depth]}
                strokeWidth="1"
                strokeOpacity="0.1"
              />
            ))}

            {/* Nodes */}
            {nodes.map((node, i) => (
              <g 
                key={`node-${i}`} 
                className="transition-opacity duration-300"
                onClick={() => setSelectedSkill(node)}
                onMouseEnter={() => setSelectedSkill(node)}
                style={{ cursor: 'pointer' }}
              >
                {/* Outer Glow */}
                <circle 
                  cx={node.x} 
                  cy={node.y} 
                  r={node.radius + 5} 
                  fill={DEPTH_COLORS[node.depth]} 
                  fillOpacity="0.05"
                />
                {/* Main Node */}
                <circle 
                  cx={node.x} 
                  cy={node.y} 
                  r={node.radius} 
                  fill="#09090b"
                  stroke={DEPTH_COLORS[node.depth]} 
                  strokeWidth={selectedSkill?.name === node.name ? "3" : "1.5"}
                  filter="url(#glow)"
                  className="transition-all duration-300"
                />
                {/* Label */}
                <text 
                  x={node.x} 
                  y={node.y} 
                  textAnchor="middle" 
                  dy=".3em" 
                  fill="#fff" 
                  fontSize={node.radius > 40 ? "10px" : "8px"}
                  fontWeight="600"
                  className="pointer-events-none select-none"
                >
                  {node.name.length > 12 ? node.name.slice(0, 10) + '..' : node.name}
                </text>
              </g>
            ))}

            {/* Central Core */}
            <g transform={`translate(${(containerRef.current?.offsetWidth || 600) / 2}, 250)`}>
              <circle r="40" fill="#10b981" fillOpacity="0.05" />
              <circle r="25" fill="#000" stroke="#10b981" strokeWidth="2" filter="url(#glow)" />
              <text textAnchor="middle" dy=".3em" fill="#10b981" fontSize="8px" fontWeight="bold">CORE</text>
            </g>
          </svg>

          {/* Mini Detail Overlay */}
          {selectedSkill && (
            <div className="absolute bottom-6 left-6 right-6 bg-zinc-900/90 backdrop-blur-md border border-zinc-700 p-5 rounded-2xl animate-in slide-in-from-bottom-4 shadow-2xl pointer-events-none">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="text-white font-bold text-lg">{selectedSkill.name}</h4>
                  <div className="flex gap-2 items-center mt-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      selectedSkill.depth === 'Advanced' ? 'bg-emerald-500 text-black' :
                      selectedSkill.depth === 'Intermediate' ? 'bg-blue-500 text-white' : 'bg-zinc-700 text-zinc-300'
                    }`}>
                      {selectedSkill.depth}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Confidence: {(selectedSkill.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
              <p className="text-zinc-400 text-xs italic line-clamp-2">"{selectedSkill.evidence}"</p>
            </div>
          )}
        </div>

        {/* Evaluation Summary Sidebar */}
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Executive Summary</h3>
            <div className={`text-4xl font-black mb-1 ${
              data.hiringRecommendation === 'Hire' ? 'text-emerald-500' :
              data.hiringRecommendation === 'Borderline' ? 'text-amber-500' : 'text-red-500'
            }`}>
              {data.hiringRecommendation.toUpperCase()}
            </div>
            <div className="text-xs text-zinc-500 font-mono flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              Decision Certainty: {(data.confidenceScore * 100).toFixed(0)}%
            </div>
            
            <div className="mt-8 pt-6 border-t border-zinc-800">
              <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Risk Telemetry</h4>
              <div className="space-y-3">
                {data.riskSignals.length > 0 ? data.riskSignals.map((risk, i) => (
                  <div key={i} className="flex items-start gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      risk.severity === 'high' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' :
                      risk.severity === 'medium' ? 'bg-amber-500' : 'bg-zinc-500'
                    }`} />
                    <span className="text-[11px] text-zinc-300 leading-tight">{risk.description}</span>
                  </div>
                )) : (
                  <div className="text-[11px] text-zinc-600 italic">Nominal signals detected.</div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
             <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Usage Tip</h4>
             <p className="text-[11px] text-zinc-500 leading-relaxed">
               Hover or tap nodes in the Skill Topology to cross-reference interview evidence and confidence weighting.
             </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SkillGraph;
