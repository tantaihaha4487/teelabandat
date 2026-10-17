export interface SectionData {
  id: string;
  title: string;
  summary: string;
  order: number;
  kind: "course" | "practice";
  label: string;
  icon: "code" | "branch" | "practice" | "book";
  bank?: string;
}
export interface LineNote {
  range: [number, number];
  note: string;
}
export interface HighlightedCodeToken {
  content: string;
  color?: string;
  fontStyle?: number;
}
export type HighlightedCodeLine = HighlightedCodeToken[];
export interface CodeExampleData {
  id: string;
  language: string;
  code: string;
  notes: LineNote[];
  output?: string;
  status: "working" | "broken" | "fragment";
  error?: string;
  title?: string;
}
export type TraceValue = string | number | boolean | null | TraceValue[] | { [key: string]: TraceValue };
export interface TraceVariable {
  name: string;
  value: TraceValue;
  scope?: string;
  change?: "new" | "changed" | "removed";
}
export interface TraceSnapshot {
  line: number;
  noteIndex?: number;
  scope?: string;
  variables: TraceVariable[];
  /** Cumulative stdout after this source line. */
  stdout?: string;
  error?: string;
  event?: "line" | "return" | "exception";
  returnValue?: TraceValue;
  needsInput?: number;
  inputPrompt?: string;
}
export interface EditableCodeValue {
  id: string;
  label: string;
  kind: "input" | "value";
  target: string;
  initial: string | number | boolean;
  type?: "text" | "number" | "boolean";
}
export interface CodeTeachingData {
  mode: "console" | "walkthrough";
  summary?: string;
  inputs?: string[];
  values?: Record<string, string | number | boolean>;
  files?: Record<string, string>;
  setup?: string;
  context?: string;
  randomSeed?: number;
  date?: string;
  editable?: EditableCodeValue[];
  trace?: TraceSnapshot[];
  consoleOutput?: string;
}
export interface QuizQuestion {
  sourceId: number;
  bank: string;
  topic: string;
  prompt: string;
  context?: string;
  code: string;
  options: string[];
  correctIndex: number;
  hint: string;
  reasoningSteps: string[];
}
export interface QuizBank {
  id: string;
  title: string;
  description: string;
  topics: { id: string; title: string }[];
  questions: QuizQuestion[];
}
export interface SearchEntry {
  id: string;
  type: "lesson" | "question";
  title: string;
  description: string;
  section: string;
  url: string;
  body: string;
}
