# import torch
# from transformers import pipeline, BitsAndBytesConfig, AutoProcessor, LlavaForConditionalGeneration
# from PIL import Image

# # quantization_config = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16)
# quantization_config = BitsAndBytesConfig(
#     load_in_4bit=True,
#     bnb_4bit_compute_dtype=torch.float16
# )


# model_id = "llava-hf/llava-1.5-7b-hf"
# processor = AutoProcessor.from_pretrained(model_id)
# model = LlavaForConditionalGeneration.from_pretrained(model_id, quantization_config=quantization_config, device_map="auto")
# # pipe = pipeline("image-to-text", model=model_id, model_kwargs={"quantization_config": quantization_config})

# def analyze_image(image: Image):
#     prompt = "USER: <image>\nAnalyze the equation or expression in this image, and return answer in format: {expr: given equation in LaTeX format, result: calculated answer}"

#     inputs = processor(prompt, images=[image], padding=True, return_tensors="pt").to("cuda")
#     for k, v in inputs.items():
#         print(k,v.shape)

#     output = model.generate(**inputs, max_new_tokens=20)
#     generated_text = processor.batch_decode(output, skip_special_tokens=True)
#     for text in generated_text:
#         print(text.split("ASSISTANT:")[-1])

import ast
import re
from typing import Any, Dict, List


def _normalize_expression(expression: str) -> str:
    expression = expression.strip()
    expression = re.sub(r"\s+", "", expression)
    expression = expression.replace("^", "**")
    expression = expression.replace("×", "*").replace("÷", "/")
    return expression


def _evaluate_expression(expression: str, variables: Dict[str, Any]) -> Any:
    expression = _normalize_expression(expression)
    tree = ast.parse(expression, mode="eval")

    def _eval(node: ast.AST) -> Any:
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.Name):
            return variables.get(node.id, 0)
        if isinstance(node, ast.UnaryOp):
            operand = _eval(node.operand)
            if isinstance(node.op, ast.UAdd):
                return +operand
            if isinstance(node.op, ast.USub):
                return -operand
        if isinstance(node, ast.BinOp):
            left = _eval(node.left)
            right = _eval(node.right)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right
            if isinstance(node.op, ast.Pow):
                return left ** right
        raise ValueError(f"Unsupported expression: {expression}")

    return _eval(tree.body)


def analyze_text(text: str, dict_of_vars: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
    if not text:
        return []

    variables = dict(dict_of_vars or {})
    cleaned_text = text.strip()

    if "=" in cleaned_text and cleaned_text.count("=") == 1:
        left, right = [part.strip() for part in cleaned_text.split("=", 1)]
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", left):
            result = _evaluate_expression(right, variables)
            variables[left] = result
            return [{"expr": left, "result": result, "assign": True}]

    try:
        result = _evaluate_expression(cleaned_text, variables)
        return [{"expr": cleaned_text, "result": result, "assign": False}]
    except Exception:
        return [{"expr": cleaned_text, "result": cleaned_text, "assign": False}]


def analyze_image(img: Any, dict_of_vars: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
    if isinstance(img, str):
        return analyze_text(img, dict_of_vars)

    if img is None:
        return []

    try:
        import pytesseract

        extracted_text = pytesseract.image_to_string(img)
        return analyze_text(extracted_text, dict_of_vars)
    except Exception:
        return []