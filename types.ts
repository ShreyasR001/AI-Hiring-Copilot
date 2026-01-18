
export interface InterviewRole {
  id: string;
  title: string;
  description: string;
}

export interface Message {
  role: 'interviewer' | 'candidate';
  text: string;
  timestamp: number;
}

export enum InterviewStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED'
}

export type SkillDepth = 'None' | 'Basic' | 'Intermediate' | 'Advanced';

export interface SkillEntry {
  name: string;
  depth: SkillDepth;
  evidence: string;
  confidence: number; // 0.0 to 1.0
}

export interface RiskSignal {
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface SkillGraphData {
  skills: SkillEntry[];
  riskSignals: RiskSignal[];
  hiringRecommendation: 'Hire' | 'Borderline' | 'No Hire';
  confidenceScore: number;
}

export interface ClaimedSkill {
  name: string;
  level: string;
  evidenceStrength: 'Strong' | 'Moderate' | 'Weak';
}

export interface PreInterviewReport {
  claimedSkills: ClaimedSkill[];
  verificationPlan: string;
  targetedQuestions: string[];
}
