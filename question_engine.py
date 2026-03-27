"""
Question Engine Module for JEE Smart Practice

Consolidates:
- dataset_final.json loading, parsing, cleaning, and caching
- Mock test generation
- Chatbot logic
- Topic Analysis metadata
"""

import json
from pathlib import Path
from typing import Any
import re
import random

ROOT_DIR = Path(__file__).resolve().parent

# ──────────────────────────────────────────────────────────────────────────────
# Topic Analysis Metadata
# ──────────────────────────────────────────────────────────────────────────────

TOPIC_KEYWORDS: dict[str, list[str]] = {
    "physics": [
        "Electrostatics", "Current Electricity", "Magnetism", "Electromagnetic Induction",
        "Electromagnetic Waves", "Optics", "Modern Physics", "Photoelectric",
        "Semiconductor", "Wave Optics", "Ray Optics", "Thermodynamics",
        "Kinetic Theory", "Gravitation", "Oscillations", "Waves",
        "Rotational Motion", "Moment of Inertia", "Fluid Mechanics",
        "Surface Tension", "Viscosity", "Elasticity", "Friction",
        "Newton's Laws", "Work Energy", "Projectile", "Kinematics",
        "Units and Dimensions", "Nuclear Physics", "Radioactivity",
        "Capacitor", "Resistance", "Magnetic Field", "Alternating Current",
        "Lens", "Mirror", "Diffraction", "Interference", "Polarization",
        "Simple Harmonic Motion",
    ],
    "chemistry": [
        "Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry",
        "Thermodynamics", "Chemical Kinetics", "Equilibrium",
        "Electrochemistry", "Coordination Compounds", "Atomic Structure",
        "Chemical Bonding", "Periodic Table", "Solutions", "Solid State",
        "Surface Chemistry", "Polymers", "Biomolecules", "Hydrocarbons",
        "Alkyl Halide", "Alcohol", "Phenol", "Ether", "Aldehyde",
        "Ketone", "Carboxylic Acid", "Amine", "p-Block", "d-Block",
        "s-Block", "Metallurgy", "Redox", "Mole Concept", "Stoichiometry",
        "Isomerism", "GOC", "Benzene", "Aromatic", "Nuclear Magnetic",
        "Enthalpy", "Entropy", "Gibbs",
    ],
    "mathematics": [
        "Calculus", "Integration", "Differentiation", "Differential Equations",
        "Limits", "Continuity", "Coordinate Geometry", "Straight Lines",
        "Circle", "Parabola", "Ellipse", "Hyperbola", "Conic Sections",
        "Matrices", "Determinants", "Vectors", "Three Dimensional",
        "3D Geometry", "Probability", "Statistics", "Permutations",
        "Combinations", "Binomial Theorem", "Sequences", "Series",
        "Arithmetic Progression", "Geometric Progression", "Trigonometry",
        "Complex Numbers", "Quadratic", "Sets", "Relations", "Functions",
        "Mathematical Induction", "Linear Programming", "Logarithm",
        "Area Under Curve", "Definite Integral", "Indefinite Integral",
        "Maxima", "Minima",
    ],
}

def detect_topics(all_questions: list[dict[str, Any]]) -> dict[str, list[tuple[str, int]]]:
    topic_counts: dict[str, dict[str, int]] = {
        subj: {kw: 0 for kw in keywords}
        for subj, keywords in TOPIC_KEYWORDS.items()
    }

    for q in all_questions:
        text = (q.get("question", "") or "").lower()
        subject = (q.get("subject", "") or "").lower()

        subjects_to_check: list[str] = [subject] if subject in topic_counts else list(TOPIC_KEYWORDS.keys())

        for subj in subjects_to_check:
            for keyword in TOPIC_KEYWORDS[subj]:
                if keyword.lower() in text:
                    topic_counts[subj][keyword] += 1

    result: dict[str, list[tuple[str, int]]] = {}
    for subj, counts in topic_counts.items():
        sorted_topics = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        result[subj] = [(topic, count) for topic, count in sorted_topics if count > 0]

    return result

def get_important_topics(all_questions: list[dict[str, Any]], top_n: int = 5) -> dict[str, list[str]]:
    all_topics = detect_topics(all_questions)
    return {
        subj: [topic for topic, _ in topics[:top_n]]
        for subj, topics in all_topics.items()
    }


# ──────────────────────────────────────────────────────────────────────────────
# Chatbot Logic
# (Moved to chatbot.py using Google Gemini)
# ──────────────────────────────────────────────────────────────────────────────

# Dataset Loading and Caching
# ──────────────────────────────────────────────────────────────────────────────

def _clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"JEE\s*Main\s*20\d{2}.*?(Question\s*Paper.*)?$", "", text, flags=re.IGNORECASE)
    text = text.replace("\uf0b7", " ").replace("•", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", "\n", text)
    return text.strip()

def _clean_dataset(raw_questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    for q in raw_questions:
        q_copy = dict(q)
        q_copy["question"] = _clean_text(q_copy.get("question", ""))
        opts = q_copy.get("options")
        if isinstance(opts, dict):
            q_copy["options"] = {k: _clean_text(str(v)) for k, v in opts.items()}
        cleaned.append(q_copy)
    return cleaned

# Cache the dataset in memory
print("Loading dataset_final.json...")
try:
    with open(ROOT_DIR / "dataset_final.json", "r", encoding="utf-8") as f:
        _raw_questions: list[dict[str, Any]] = json.load(f)
except FileNotFoundError:
    print("Warning: dataset_final.json not found. Returning empty structure.")
    _raw_questions = []

questions: list[dict[str, Any]] = _clean_dataset(_raw_questions)
questions_lookup: dict[str, dict[str, Any]] = {q["id"]: q for q in questions}

# Cache strictly the curated questions for mock tests by subject
mock_questions_by_subject: dict[str, list[dict[str, Any]]] = {}
for q in questions:
    if q.get("is_curated", False):
        subj = (q.get("subject") or "unknown").lower()
        mock_questions_by_subject.setdefault(subj, []).append(q)

def generate_mock_test(n_phy: int = 30, n_chem: int = 30, n_math: int = 30) -> list[dict[str, Any]]:
    test_questions = []
    
    phy_pool = mock_questions_by_subject.get("physics", [])
    chem_pool = mock_questions_by_subject.get("chemistry", [])
    math_pool = mock_questions_by_subject.get("mathematics", [])
    
    test_questions.extend(random.sample(phy_pool, min(n_phy, len(phy_pool))))
    test_questions.extend(random.sample(chem_pool, min(n_chem, len(chem_pool))))
    test_questions.extend(random.sample(math_pool, min(n_math, len(math_pool))))
    
    return test_questions
