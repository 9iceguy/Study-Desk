import {
  ArrowDown,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FilePlus2,
  FileText,
  LoaderCircle,
  Network,
  Pause,
  Play,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  askStudyQuestion,
  createMindMap,
  explainTopic,
  extractPdf,
  getStudyStatus,
} from "@/lib/studyApi";
import {
  deleteStudyDocument,
  loadStudyDocuments,
  saveStudyDocument,
} from "@/lib/studyStorage";
import type {
  Citation,
  StudyDocument,
  StudyExplanation,
  StudyMindMap,
} from "@/lib/study";
import "./study.css";

type StudyMode = "tutor" | "map" | "explain";
type ModelStatus =
  | "checking"
  | "ready"
  | "needs-setup"
  | "ollama-offline"
  | "offline";

const MODEL_STATUS_LABELS: Record<ModelStatus, string> = {
  checking: "Checking local model",
  ready: "Local AI ready",
  "needs-setup": "Model needs setup",
  "ollama-offline": "Ollama not running",
  offline: "Backend not running",
};

interface ChatMessage {
  role: "student" | "tutor";
  text: string;
  citations?: Citation[];
}

const MODE_DETAILS: Record<
  StudyMode,
  { title: string; subtitle: string; action: string }
> = {
  tutor: {
    title: "Ask your course notes",
    subtitle:
      "Get a clear, course-aware answer grounded in the materials you add.",
    action: "Ask tutor",
  },
  map: {
    title: "See how ideas connect",
    subtitle:
      "Turn a topic in your notes into a cited concept map you can explore.",
    action: "Build mind map",
  },
  explain: {
    title: "Make the hard parts click",
    subtitle:
      "Learn a difficult idea through short, animated explanation steps.",
    action: "Explain visually",
  },
};

const MAP_POSITIONS = [
  { x: 500, y: 58 },
  { x: 175, y: 210 },
  { x: 500, y: 210 },
  { x: 825, y: 210 },
  { x: 175, y: 390 },
  { x: 500, y: 390 },
  { x: 825, y: 390 },
  { x: 500, y: 500 },
];

function documentId(): string {
  return crypto.randomUUID();
}

function Citations({ citations }: { citations: Citation[] }) {
  const uniqueCitations = useMemo(
    () =>
      citations.filter(
        (citation, index, all) =>
          all.findIndex(
            (item) =>
              item.document === citation.document &&
              item.page === citation.page,
          ) === index,
      ),
    [citations],
  );

  if (!uniqueCitations.length) return null;

  return (
    <div className="study-citations" aria-label="Sources used">
      <span>Sources</span>
      {uniqueCitations.map((citation) => (
        <span
          className="study-citation"
          key={`${citation.document}-${citation.page}`}
        >
          <FileText size={13} aria-hidden="true" />
          {citation.document}, p. {citation.page}
        </span>
      ))}
    </div>
  );
}

export default function StudyWorkspace() {
  const [mode, setMode] = useState<StudyMode>("tutor");
  const [course, setCourse] = useState("General STEM");
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [topic, setTopic] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mindMap, setMindMap] = useState<StudyMindMap>();
  const [explanation, setExplanation] = useState<StudyExplanation>();
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("checking");
  const [modelMessage, setModelMessage] = useState("Checking local AI…");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    loadStudyDocuments()
      .then((savedDocuments) => {
        if (active) setDocuments(savedDocuments);
      })
      .catch(() => {
        if (active) {
          setError(
            "Could not open the local study library. Check that this browser allows site storage.",
          );
        }
      });

    getStudyStatus()
      .then((status) => {
        if (!active) return;
        setModelStatus(
          status.available
            ? "ready"
            : status.running
              ? "needs-setup"
              : "ollama-offline",
        );
        setModelMessage(status.message);
      })
      .catch(() => {
        if (!active) return;
        setModelStatus("offline");
        setModelMessage("Start the local backend to use AI study tools.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isWorking]);

  useEffect(() => {
    if (!isPlaying || !explanation) return;
    const timer = window.setInterval(() => {
      setActiveStep((current) => {
        if (current >= explanation.steps.length - 1) {
          setIsPlaying(false);
          return 0;
        }
        return current + 1;
      });
    }, 3500);
    return () => window.clearInterval(timer);
  }, [isPlaying, explanation]);

  async function addDocument(document: StudyDocument) {
    await saveStudyDocument(document);
    setDocuments((current) => [...current, document]);
  }

  async function addPastedNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = noteText.trim();
    if (!content) {
      setError("Paste some note text before adding it to your study library.");
      return;
    }

    const name = noteTitle.trim() || `Pasted notes ${documents.length + 1}`;
    try {
      await addDocument({
        id: documentId(),
        name,
        pages: [{ page: 1, content }],
      });
      setNoteText("");
      setNoteTitle("");
      setError("");
    } catch {
      setError("Could not save this note to the local study library.");
    }
  }

  async function addPdfFiles(files: FileList | null) {
    if (!files?.length) return;
    setIsUploading(true);
    setError("");
    const failures: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const extracted = await extractPdf(file);
        await addDocument({
          id: documentId(),
          name: extracted.name,
          pages: extracted.pages,
        });
      } catch (uploadError) {
        failures.push(
          `${file.name}: ${
            uploadError instanceof Error
              ? uploadError.message
              : "PDF could not be added."
          }`,
        );
      }
    }

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(failures.join(" "));
  }

  async function removeDocument(id: string) {
    try {
      await deleteStudyDocument(id);
      setDocuments((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("Could not remove this source from the local study library.");
    }
  }

  async function submitStudyAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = topic.trim();
    if (!question) {
      setError("Enter a topic or question to get started.");
      return;
    }
    if (!documents.length) {
      setError("Add a note or searchable PDF before asking about your course.");
      return;
    }
    if (!course.trim()) {
      setError("Enter your course or subject so the tutor can tailor its answer.");
      return;
    }

    setError("");
    setIsWorking(true);
    try {
      if (mode === "tutor") {
        setMessages((current) => [...current, { role: "student", text: question }]);
        const result = await askStudyQuestion(course.trim(), question, documents);
        setMessages((current) => [
          ...current,
          { role: "tutor", text: result.answer, citations: result.citations },
        ]);
      } else if (mode === "map") {
        setMindMap(await createMindMap(course.trim(), question, documents));
      } else {
        setExplanation(await explainTopic(course.trim(), question, documents));
        setActiveStep(0);
        setIsPlaying(false);
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The study request could not be completed.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  const detail = MODE_DETAILS[mode];

  return (
    <main className="study-shell">
      <aside className="study-sidebar">
        <Link to="/" className="study-brand" aria-label="Study Desk home">
          <span className="study-brand-icon">
            <BookOpen size={20} aria-hidden="true" />
          </span>
          <span>
            <strong>Study Desk</strong>
            <small>STEM learning, grounded in your notes</small>
          </span>
        </Link>

        <div className="study-course-block">
          <label htmlFor="course-name">YOUR COURSE</label>
          <input
            id="course-name"
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            placeholder="e.g. PHY 102 · Mechanics"
            maxLength={160}
          />
          <p>Set a course to tailor explanations and examples.</p>
        </div>

        <nav className="study-tools" aria-label="Study tools">
          <span className="study-section-label">STUDY TOOLS</span>
          <button
            className={mode === "tutor" ? "study-tool active" : "study-tool"}
            onClick={() => setMode("tutor")}
            type="button"
          >
            <CircleHelp size={17} aria-hidden="true" />
            Ask your notes
          </button>
          <button
            className={mode === "map" ? "study-tool active" : "study-tool"}
            onClick={() => setMode("map")}
            type="button"
          >
            <Network size={17} aria-hidden="true" />
            Concept map
          </button>
          <button
            className={mode === "explain" ? "study-tool active" : "study-tool"}
            onClick={() => setMode("explain")}
            type="button"
          >
            <Sparkles size={17} aria-hidden="true" />
            Visual explanation
          </button>
          <Link to="/canvas" className="study-tool">
            <FilePlus2 size={17} aria-hidden="true" />
            Math canvas
          </Link>
        </nav>

        <section className="study-library">
          <div className="study-library-heading">
            <span className="study-section-label">YOUR SOURCES</span>
            <span className="study-source-count">{documents.length}</span>
          </div>

          <form onSubmit={addPastedNote} className="study-note-form">
            <input
              aria-label="Note name"
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
              placeholder="Note title (optional)"
              maxLength={255}
            />
            <textarea
              ref={noteInputRef}
              aria-label="Paste course notes"
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Paste lecture notes, a formula sheet, or a difficult passage…"
              rows={4}
            />
            <button type="submit" className="study-add-note">
              <Plus size={15} aria-hidden="true" />
              Add pasted notes
            </button>
          </form>

          <input
            ref={fileInputRef}
            className="study-hidden-input"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            aria-label="Choose searchable PDF files"
            onChange={(event) => void addPdfFiles(event.target.files)}
          />
          <button
            className="study-upload-button"
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <LoaderCircle className="study-spinner" size={16} aria-hidden="true" />
            ) : (
              <Upload size={16} aria-hidden="true" />
            )}
            {isUploading ? "Reading PDFs…" : "Add PDF sources"}
          </button>
          <p className="study-storage-note">
            Notes stay in this browser. PDFs must contain selectable text.
          </p>

          <div className="study-source-list">
            {documents.map((document) => (
              <div className="study-source-item" key={document.id}>
                <FileText size={15} aria-hidden="true" />
                <div>
                  <strong title={document.name}>{document.name}</strong>
                  <small>
                    {document.pages.length}{" "}
                    {document.pages.length === 1 ? "page" : "pages"}
                  </small>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${document.name}`}
                  title="Remove source"
                  onClick={() => void removeDocument(document.id)}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
            {!documents.length && (
              <p className="study-empty-sources">
                Your notes and PDFs will appear here.
              </p>
            )}
          </div>
        </section>

        <div className={`study-model-status ${modelStatus}`}>
          <span className="study-status-dot" />
          <span>
            <strong>{MODEL_STATUS_LABELS[modelStatus]}</strong>
            <small>{modelMessage}</small>
          </span>
        </div>
      </aside>

      <section className="study-main">
        <header className="study-topbar">
          <div className="study-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{detail.title}</strong>
          </div>
          <div className="study-topbar-right">
            <span className="study-local-badge">
              <Check size={13} aria-hidden="true" />
              Private · runs locally
            </span>
          </div>
        </header>

        <div className="study-content">
          <div className="study-heading-row">
            <div>
              <div className="study-eyebrow">
                <span>YOUR PERSONAL STEM TUTOR</span>
                <span className="study-eyebrow-line" />
              </div>
              <h1>{detail.title}</h1>
              <p>{detail.subtitle}</p>
            </div>
            <div className="study-course-chip">
              <span className="study-course-dot" />
              {course || "Choose a course"}
            </div>
          </div>

          <div className="study-workbench">
            <div className="study-work-area">
              <form className="study-prompt-form" onSubmit={submitStudyAction}>
                <label htmlFor="study-topic">
                  {mode === "tutor"
                    ? "WHAT WOULD YOU LIKE TO UNDERSTAND?"
                    : mode === "map"
                      ? "WHAT TOPIC SHOULD THE MAP COVER?"
                      : "WHAT SHOULD WE EXPLAIN?"}
                </label>
                <div className="study-prompt-controls">
                  <input
                    id="study-topic"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder={
                      mode === "tutor"
                        ? "e.g. Why does an object in circular motion accelerate?"
                        : mode === "map"
                          ? "e.g. Newton's laws and their applications"
                          : "e.g. How does a derivative describe motion?"
                    }
                    maxLength={2000}
                  />
                  <button
                    className="study-primary-button"
                    type="submit"
                    disabled={isWorking || !topic.trim()}
                  >
                    {isWorking ? (
                      <LoaderCircle
                        className="study-spinner"
                        size={17}
                        aria-hidden="true"
                      />
                    ) : mode === "map" ? (
                      <Network size={16} aria-hidden="true" />
                    ) : mode === "explain" ? (
                      <Sparkles size={16} aria-hidden="true" />
                    ) : (
                      <CircleHelp size={16} aria-hidden="true" />
                    )}
                    {isWorking ? "Working…" : detail.action}
                  </button>
                </div>
              </form>

              {error && (
                <div className="study-error" role="alert">
                  <span>{error}</span>
                  <button
                    type="button"
                    aria-label="Dismiss error"
                    onClick={() => setError("")}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              )}

              {mode === "tutor" && (
                <section className="study-result-panel" aria-live="polite">
                  {!messages.length && !isWorking ? (
                    <div className="study-empty-state">
                      <div className="study-empty-icon">
                        <Sparkles size={24} aria-hidden="true" />
                      </div>
                      <h2>Start with the part that feels confusing</h2>
                      <p>
                        Add your lecture notes or PDFs, then ask a question.
                        The tutor will use the most relevant pages and show
                        where its answer came from.
                      </p>
                      <div className="study-suggestion-row">
                        <button
                          type="button"
                          onClick={() =>
                            setTopic("Explain this idea in simple steps")
                          }
                        >
                          Explain a concept
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setTopic("Give me a worked example from my notes")
                          }
                        >
                          Show a worked example
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="study-chat">
                      {messages.map((message, index) => (
                        <article
                          className={`study-message ${message.role}`}
                          key={`${message.role}-${index}`}
                        >
                          <div className="study-message-label">
                            {message.role === "student"
                              ? "YOU ASKED"
                              : "STUDY DESK"}
                          </div>
                          <div className="study-message-text">{message.text}</div>
                          {message.citations && (
                            <Citations citations={message.citations} />
                          )}
                        </article>
                      ))}
                      {isWorking && (
                        <div className="study-thinking">
                          <LoaderCircle
                            className="study-spinner"
                            size={17}
                            aria-hidden="true"
                          />
                          Searching your notes and preparing an explanation…
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </section>
              )}

              {mode === "map" && (
                <section className="study-result-panel" aria-live="polite">
                  {mindMap ? (
                    <MindMapView mindMap={mindMap} />
                  ) : (
                    <div className="study-empty-state">
                      <div className="study-empty-icon">
                        <Network size={24} aria-hidden="true" />
                      </div>
                      <h2>Build a map from your own course material</h2>
                      <p>
                        Add notes from one or more sources. The map will connect
                        relevant ideas and keep the source pages close by.
                      </p>
                    </div>
                  )}
                </section>
              )}

              {mode === "explain" && (
                <section className="study-result-panel" aria-live="polite">
                  {explanation ? (
                    <AnimatedExplanation
                      explanation={explanation}
                      activeStep={activeStep}
                      isPlaying={isPlaying}
                      onTogglePlay={() => setIsPlaying((playing) => !playing)}
                      onPrevious={() => {
                        setIsPlaying(false);
                        setActiveStep((step) =>
                          Math.max(0, step - 1),
                        );
                      }}
                      onNext={() => {
                        setIsPlaying(false);
                        setActiveStep((step) =>
                          Math.min(explanation.steps.length - 1, step + 1),
                        );
                      }}
                      onSelectStep={(step) => {
                        setIsPlaying(false);
                        setActiveStep(step);
                      }}
                    />
                  ) : (
                    <div className="study-empty-state">
                      <div className="study-empty-icon">
                        <Sparkles size={24} aria-hidden="true" />
                      </div>
                      <h2>Turn a difficult idea into a short lesson</h2>
                      <p>
                        Get a sequence of small steps, visual cues, and a
                        play-through that highlights each idea as it is
                        explained.
                      </p>
                    </div>
                  )}
                </section>
              )}
            </div>

            <aside className="study-right-rail">
              <section className="study-rail-card">
                <span className="study-section-label">HOW IT WORKS</span>
                <ol className="study-how-list">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>Add your course sources</strong>
                      <p>Paste a note or add searchable PDF lecture notes.</p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>Choose a study tool</strong>
                      <p>Ask, connect ideas, or step through an explanation.</p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>Check the page references</strong>
                      <p>Use citations to verify answers against your notes.</p>
                    </div>
                  </li>
                </ol>
              </section>
              <section className="study-rail-card study-privacy-card">
                <div className="study-privacy-icon">
                  <Check size={16} aria-hidden="true" />
                </div>
                <div>
                  <strong>Built for private study</strong>
                  <p>
                    Documents stay in this browser. AI requests go to the
                    Ollama model running on your own computer.
                  </p>
                </div>
              </section>
              <div className="study-library-tip">
                <span className="study-tip-mark">i</span>
                <p>
                  Scan PDFs? This prototype reads selectable text. For scanned
                  pages, paste OCR text into the notes box.
                </p>
              </div>
            </aside>
          </div>

          <footer className="study-footer">
            <span>Local-first study tools for STEM learners</span>
            <span>
              AI can make mistakes. Check explanations against your course
              materials.
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}

function MindMapView({ mindMap }: { mindMap: StudyMindMap }) {
  const positions = mindMap.nodes.map(
    (_, index) => MAP_POSITIONS[index] ?? { x: 500, y: 500 },
  );
  const nodesById = new Map(
    mindMap.nodes.map((node, index) => [node.id, { node, index }]),
  );

  return (
    <div className="study-map-view">
      <div className="study-map-heading">
        <div>
          <span className="study-section-label">CONCEPT MAP</span>
          <h2>{mindMap.title}</h2>
        </div>
        <span className="study-model-tag">{mindMap.model}</span>
      </div>
      <div className="study-map-canvas">
        <svg
          className="study-map-lines"
          viewBox="0 0 1000 560"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="study-map-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {mindMap.edges.map((edge, index) => {
            const source = nodesById.get(edge.source);
            const target = nodesById.get(edge.target);
            if (!source || !target) return null;
            const from = positions[source.index];
            const to = positions[target.index];
            return (
              <line
                key={`${edge.source}-${edge.target}-${index}`}
                x1={from.x}
                y1={from.y + 35}
                x2={to.x}
                y2={to.y - 42}
                markerEnd="url(#study-map-arrow)"
              />
            );
          })}
        </svg>
        {mindMap.nodes.map((node, index) => {
          const position = positions[index];
          return (
            <article
              className={`study-map-node ${index === 0 ? "root" : ""}`}
              key={node.id}
              style={{
                left: `${(position.x / 1000) * 100}%`,
                top: `${(position.y / 560) * 100}%`,
              }}
            >
              <strong>{node.label}</strong>
              <p>{node.detail}</p>
            </article>
          );
        })}
      </div>
      {mindMap.edges.length > 0 && (
        <div className="study-map-relationships">
          {mindMap.edges.map((edge, index) => {
            const source = nodesById.get(edge.source)?.node.label;
            const target = nodesById.get(edge.target)?.node.label;
            return (
              <span key={`${edge.source}-${edge.target}-${index}`}>
                {source} <ArrowDown size={12} aria-hidden="true" />{" "}
                {edge.label || "connects to"} <ArrowDown size={12} aria-hidden="true" />{" "}
                {target}
              </span>
            );
          })}
        </div>
      )}
      <Citations citations={mindMap.citations} />
    </div>
  );
}

function AnimatedExplanation({
  explanation,
  activeStep,
  isPlaying,
  onTogglePlay,
  onPrevious,
  onNext,
  onSelectStep,
}: {
  explanation: StudyExplanation;
  activeStep: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelectStep: (step: number) => void;
}) {
  const currentStep = explanation.steps[activeStep];
  const progress = ((activeStep + 1) / explanation.steps.length) * 100;

  return (
    <div className="study-explanation">
      <div className="study-map-heading">
        <div>
          <span className="study-section-label">VISUAL EXPLANATION</span>
          <h2>{explanation.title}</h2>
        </div>
        <span className="study-model-tag">{explanation.model}</span>
      </div>
      <div className="study-lesson-visual">
        <div className="study-lesson-track" aria-hidden="true">
          <div
            className="study-lesson-progress"
            style={{ width: `${progress}%` }}
          />
          {explanation.steps.map((step, index) => (
            <span
              className={index <= activeStep ? "complete" : ""}
              key={`${step.title}-${index}`}
              style={{ left: `${((index + 0.5) / explanation.steps.length) * 100}%` }}
            >
              {index + 1}
            </span>
          ))}
        </div>
        <div className="study-lesson-scene" key={activeStep}>
          <span className="study-scene-orbit orbit-one" />
          <span className="study-scene-orbit orbit-two" />
          <span className="study-scene-core">{activeStep + 1}</span>
          <div>
            <span>VISUAL CUE</span>
            <p>{currentStep.visual}</p>
          </div>
        </div>
        <div className="study-lesson-controls">
          <button
            type="button"
            aria-label="Previous explanation step"
            onClick={onPrevious}
            disabled={activeStep === 0}
          >
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <button
            className="study-play-button"
            type="button"
            onClick={onTogglePlay}
          >
            {isPlaying ? (
              <Pause size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
            {isPlaying ? "Pause lesson" : "Play lesson"}
          </button>
          <button
            type="button"
            aria-label="Next explanation step"
            onClick={onNext}
            disabled={activeStep === explanation.steps.length - 1}
          >
            <ChevronRight size={17} aria-hidden="true" />
          </button>
          <span>
            Step {activeStep + 1} of {explanation.steps.length}
          </span>
        </div>
      </div>
      <div className="study-step-list">
        {explanation.steps.map((step, index) => (
          <button
            className={index === activeStep ? "study-step-card active" : "study-step-card"}
            key={`${step.title}-${index}`}
            onClick={() => onSelectStep(index)}
            type="button"
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.explanation}</p>
            </div>
          </button>
        ))}
      </div>
      <Citations citations={explanation.citations} />
    </div>
  );
}
