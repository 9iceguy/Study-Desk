# Study Desk

Study Desk is a local-first STEM study assistant for university students who
need help making difficult ideas in a particular course understandable. Add
your own lecture notes, ask questions against them, map relationships between
concepts, and play through short visual explanations. Answers include the
document pages selected as sources so students can check them against their
course material.

## The problem and intended users

STEM students often have to connect dense lecture notes, equations, and ideas
across several course documents. General-purpose answers can be hard to relate
to a particular course and may not show where the explanation came from.
Study Desk lets a student identify their course, bring together its notes, and
study from those sources with a locally run open-weight model.

## Features

- Paste notes or import several searchable-text PDFs into a private, persistent
  browser library.
- Ask course-aware questions over notes and PDFs, with relevant source-page
  references in responses.
- Generate a concept map from selected course material.
- Generate and play a short, step-by-step visual explanation, with controls to
  pause, move between steps, and reduce motion through the operating system
  accessibility setting.
- Use the existing math canvas alongside the new study workspace.
- Keep document storage and AI inference on the local machine; the app does not
  call a hosted AI API.

## Model and technical decisions

The study tutor, concept maps, and visual-explanation steps use
[`qwen2.5:3b`](https://ollama.com/library/qwen2.5), an open-weight model served
locally by Ollama. The model's published license is Apache 2.0; check the
model card and license for the exact artifact you download before redistribution
or other use.

The backend retrieves note pages using lexical overlap with the student's
question, then sends a bounded set of passages to the local model. It returns
the selected document/page references alongside the answer. This lightweight
retrieval approach keeps setup simple and documents local; it is not a vector
database, and relevant passages can be missed when the question uses very
different wording from the notes.

The frontend is React, TypeScript, and Vite. Study documents are stored in the
browser's IndexedDB. FastAPI extracts selectable text from PDFs with `pypdf`.
The backend calls Ollama through its local HTTP interface at
`http://127.0.0.1:11434`; it does not send study material to a remote service.
Model outputs are not guaranteed to be correct. Verify important explanations
against the cited course material.

## Requirements

- Node.js and npm for the frontend.
- Python 3.10+ for the backend.
- Ollama and the `qwen2.5:3b` model for the study AI.
- Tesseract OCR is optional and only needed for handwritten/image-based math
  recognition in the existing canvas. The study PDF importer reads searchable
  text PDFs; scanned PDFs need OCR text pasted into the notes editor.

## Install

Install dependencies while online:

```powershell
cd calc-fe-main
npm ci

cd ..\calc-be-main
python -m pip install -r requirements.txt
```

Install Ollama from [ollama.com/download](https://ollama.com/download), then
download the model once:

```powershell
ollama pull qwen2.5:3b
```

The model download is around 2 GB (the exact size depends on the Ollama
artifact). Keep Ollama installed and the model available on the computer that
will run the demo.

## Run locally

Start the backend and frontend in separate PowerShell terminals:

```powershell
cd calc-be-main
python main.py
```

```powershell
cd calc-fe-main
npm run dev
```

Open the Vite local URL, normally `http://localhost:5173/`. Ollama must be
running locally for AI features. The app displays whether the backend and
configured model are ready. To use a different local Ollama model, set
`OLLAMA_MODEL` before starting the backend. `VITE_API_URL` may point to a
different backend address; keep it on localhost for private/offline use.

After npm/Python packages and the Ollama model have been installed, normal
study sessions can run without internet access. PDF imports are limited to
20 MB and 100 pages each; each session can contain up to 300,000 characters of
extracted notes.

## Test and build

```powershell
cd calc-be-main
python -m unittest discover -s tests

cd ..\calc-fe-main
npm run lint
npm run build
```

The frontend build copies the installed MathJax assets into local static
assets, so the existing math canvas does not depend on a CDN.

## API overview

- `GET /study/status` — local model readiness.
- `POST /study/documents/pdf` — extract pages from one searchable PDF.
- `POST /study/ask` — answer a question with relevant document pages.
- `POST /study/mind-map` — create a source-grounded concept map.
- `POST /study/explain` — create a sequenced explanation.
- `POST /calculate` — existing math-canvas endpoint.

## Limitations

- AI responses can be inaccurate or incomplete; source references show which
  pages were supplied to the model, not an independent verification of every
  statement.
- Retrieval is based on word overlap. It may miss context that uses
  substantially different terminology.
- Password-protected and scanned/image-only PDFs are not supported by the study
  importer. No text is uploaded to an external OCR or AI service.
- The default model requires substantial local storage and memory, and response
  speed depends on the computer.
- Browser data is local to the current browser profile. Clearing site data
  removes saved notes.

## Challenge submission checklist

The submission is due **Thursday, October 29, 2026, at 11:59 PM WAT**. The
brief requires exactly two currently enrolled university students, a public
GitHub repository, a working demonstration, a clearly defined problem, and
documentation of the open-weight model and technical decisions. This prototype
is designed around the judging rubric:

| Judging criterion | How Study Desk addresses it |
| --- | --- |
| Problem understanding and usefulness (25 points) | A course-aware STEM tutor grounded in a student's own notes. |
| Working prototype and execution (25 points) | Note and PDF import, cited Q&A, concept maps, and playable explanations. |
| Meaningful open-weight model use (20 points) | Qwen2.5 generates the study responses locally through Ollama. |
| Creativity and design (15 points) | Multiple study views share one private, source-grounded course workspace. |
| Open-source practices and documentation (15 points) | Reproducible local setup, model notes, limitations, and acknowledgements. |

Fill in the team and project details before submission:

- Team member 1: **Olu-Dada Daniel Obafemi Awolowo University**
- Team member 2: **Adeyeye Israel Obafemi Awolowo University**
- Repository/demo link: **TODO**
- Project license and copyright holders: **TODO**

Acknowledgements: this project uses React, Vite, FastAPI, Pydantic, pypdf,
Ollama, Qwen2.5, MathJax, Mantine, Lucide, and other dependencies listed in
the package manifests. Review and retain the relevant upstream license notices
when redistributing. Significant AI-assisted development should be disclosed
in the final submission according to the challenge brief.
