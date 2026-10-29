export interface StudyPage {
  page: number;
  content: string;
}

export interface StudyDocument {
  id: string;
  name: string;
  pages: StudyPage[];
}

export interface Citation {
  document: string;
  page: number;
}

export interface MindMapNode {
  id: string;
  label: string;
  detail: string;
}

export interface MindMapEdge {
  source: string;
  target: string;
  label: string;
}

export interface ExplanationStep {
  title: string;
  explanation: string;
  visual: string;
}

export interface StudyAnswer {
  answer: string;
  citations: Citation[];
  model: string;
}

export interface StudyMindMap {
  title: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  citations: Citation[];
  model: string;
}

export interface StudyExplanation {
  title: string;
  steps: ExplanationStep[];
  citations: Citation[];
  model: string;
}
