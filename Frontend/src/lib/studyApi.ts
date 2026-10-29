import type {
  StudyAnswer,
  StudyDocument,
  StudyExplanation,
  StudyMindMap,
} from "./study";

const API_URL = `${import.meta.env.VITE_API_URL || "http://localhost:8900"}/study`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail =
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      typeof body.detail === "string"
        ? body.detail
        : `Study service failed (${response.status}).`;
    throw new Error(detail);
  }
  return body as T;
}

function studyPayload(course: string, question: string, documents: StudyDocument[]) {
  return JSON.stringify({
    course,
    question,
    documents: documents.map(({ name, pages }) => ({ name, pages })),
  });
}

export function getStudyStatus(): Promise<{
  available: boolean;
  running: boolean;
  model: string;
  message: string;
}> {
  return request("/status");
}

export function askStudyQuestion(
  course: string,
  question: string,
  documents: StudyDocument[],
): Promise<StudyAnswer> {
  return request("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: studyPayload(course, question, documents),
  });
}

export function createMindMap(
  course: string,
  question: string,
  documents: StudyDocument[],
): Promise<StudyMindMap> {
  return request("/mind-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: studyPayload(course, question, documents),
  });
}

export function explainTopic(
  course: string,
  question: string,
  documents: StudyDocument[],
): Promise<StudyExplanation> {
  return request("/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: studyPayload(course, question, documents),
  });
}

export async function extractPdf(file: File): Promise<{
  name: string;
  pages: Array<{ page: number; content: string }>;
}> {
  const formData = new FormData();
  formData.append("file", file);
  return request("/documents/pdf", { method: "POST", body: formData });
}
