import sys
sys.path.insert(0, r'c:/Users/danie/OneDrive/Desktop/MathnotesClone/calc-be-main')
from apps.calculator.utils import analyze_text
print(analyze_text('2 + 2'))
print(analyze_text('x = 4'))
print(analyze_text('x + 3', {'x': 2}))
