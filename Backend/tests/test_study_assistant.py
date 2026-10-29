import json
import unittest
from unittest.mock import patch
from urllib.error import URLError

from fastapi import HTTPException

from apps.study import route as study
from apps.study.route import (
    StudyDocument,
    StudyRequest,
    StudyPage,
    _check_document_size,
    _context,
    ask,
    explain,
    mind_map,
    select_relevant_pages,
)


class StudyAssistantTests(unittest.TestCase):
    def setUp(self):
        self.documents = [
            StudyDocument(
                name="mechanics.pdf",
                pages=[
                    StudyPage(page=1, content="Newton's second law relates force and acceleration."),
                    StudyPage(page=2, content="Circular motion requires centripetal acceleration."),
                ],
            ),
            StudyDocument(
                name="biology.pdf",
                pages=[
                    StudyPage(page=1, content="Cell membranes regulate transport into cells."),
                ],
            ),
        ]

    def test_retrieval_selects_relevant_pages_from_multiple_sources(self):
        pages = select_relevant_pages(
            self.documents, "How does centripetal acceleration relate to circular motion?"
        )

        self.assertEqual(
            [(document.name, page.page) for document, page in pages],
            [("mechanics.pdf", 2), ("mechanics.pdf", 1)],
        )

    def test_context_labels_each_source_page(self):
        context, citations = _context(self.documents, "membranes transport")

        self.assertIn("[Source: biology.pdf, page 1]", context)
        self.assertEqual(citations[0], {"document": "biology.pdf", "page": 1})

    def test_empty_documents_are_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            _check_document_size(
                [StudyDocument(name="blank.pdf", pages=[StudyPage(page=1, content=" ")])]
            )

        self.assertEqual(raised.exception.status_code, 422)

    def test_oversized_study_context_is_rejected(self):
        oversized = StudyDocument(
            name="long-notes.txt",
            pages=[StudyPage(page=1, content="x" * 300_001)],
        )
        with self.assertRaises(HTTPException) as raised:
            _check_document_size([oversized])

        self.assertEqual(raised.exception.status_code, 413)

    def test_answer_uses_selected_sources_and_returns_page_citations(self):
        prompts = []

        def fake_generate(prompt, *, json_output=False):
            prompts.append(prompt)
            return "Acceleration points toward the centre of the circular path."

        with patch.object(study, "_generate", side_effect=fake_generate):
            result = ask(
                StudyRequest(
                    course="PHY 102: Mechanics",
                    question="centripetal",
                    documents=self.documents,
                )
            )

        self.assertIn("mechanics.pdf, page 2", prompts[0])
        self.assertNotIn("biology.pdf", prompts[0])
        self.assertEqual(result["citations"], [{"document": "mechanics.pdf", "page": 2}])
        self.assertEqual(result["answer"], "Acceleration points toward the centre of the circular path.")

    def test_mind_map_response_is_validated_and_cited(self):
        model_response = {
            "title": "Newton's second law",
            "nodes": [
                {"id": "root", "label": "Second law", "detail": "Force changes motion."},
                {"id": "force", "label": "Net force", "detail": "The sum of forces."},
                {"id": "bad", "label": "Bad edge target", "detail": "Not a connection."},
            ],
            "edges": [
                {"source": "root", "target": "force", "label": "relates to"},
                {"source": "root", "target": "missing", "label": "invalid"},
            ],
        }
        with patch.object(study, "_generate", return_value=json.dumps(model_response)):
            result = mind_map(
                StudyRequest(
                    course="PHY 102",
                    question="second law",
                    documents=self.documents,
                )
            )

        self.assertEqual(len(result["nodes"]), 3)
        self.assertEqual(len(result["edges"]), 1)
        self.assertEqual(result["citations"], [{"document": "mechanics.pdf", "page": 1}])

    def test_explanation_returns_ordered_short_steps(self):
        model_response = {
            "title": "Newton's second law",
            "steps": [
                {"title": "Start with motion", "explanation": "A force changes motion.", "visual": "A cart"},
                {"title": "Add mass", "explanation": "More mass needs more force.", "visual": "Two carts"},
                {"title": "Relate the quantities", "explanation": "Force equals mass times acceleration.", "visual": "F = ma"},
            ],
        }
        with patch.object(study, "_generate", return_value=json.dumps(model_response)):
            result = explain(
                StudyRequest(
                    course="PHY 102",
                    question="second law",
                    documents=self.documents,
                )
            )

        self.assertEqual(len(result["steps"]), 3)
        self.assertEqual(result["steps"][0]["title"], "Start with motion")
        self.assertEqual(result["citations"], [{"document": "mechanics.pdf", "page": 1}])

    def test_unavailable_local_model_returns_actionable_error(self):
        with patch.object(study.urllib.request, "urlopen", side_effect=URLError("refused")):
            with self.assertRaises(HTTPException) as raised:
                study._generate("test prompt")

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("Start Ollama", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
