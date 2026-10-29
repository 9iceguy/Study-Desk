import unittest

from apps.calculator.utils import analyze_text


class LocalMathParserTests(unittest.TestCase):
    def test_simple_expression_is_evaluated_locally(self):
        result = analyze_text("2 + 2")
        self.assertEqual(result, [{"expr": "2 + 2", "result": 4, "assign": False}])

    def test_assignment_is_parsed_without_api(self):
        result = analyze_text("x = 4")
        self.assertEqual(result, [{"expr": "x", "result": 4, "assign": True}])

    def test_variable_substitution_uses_known_values(self):
        result = analyze_text("x + 3", {"x": 2})
        self.assertEqual(result, [{"expr": "x + 3", "result": 5, "assign": False}])


if __name__ == "__main__":
    unittest.main()
