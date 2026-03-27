"""
Analytics Engine for JEE Smart Practice

Computes performance metrics including overall accuracy, subject-wise accuracy,
weak area detection, and rule-based remarks generation.

Also manages SQLite storage for Users, Attempts, and Mock test results.
"""

import sqlite3
import os
from typing import Dict, Any, List
from question_engine import TOPIC_KEYWORDS

DB_FILE = "smart_exam.db"

def get_connection():
    """Returns a connected SQLite connection with dict factory enabled."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize SQLite database with required tables if they don't exist."""
    print(f"Initializing database at {os.path.abspath(DB_FILE)}")
    conn = get_connection()
    cursor = conn.cursor()
    
    # Create Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            session_token TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create Attempts Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attempts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            subject TEXT,
            chapter TEXT,
            selected TEXT NOT NULL,
            correct BOOLEAN NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    
    # Migration: ensure 'chapter' column exists (older schemas used 'topic')
    try:
        cursor.execute("ALTER TABLE attempts ADD COLUMN chapter TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    # Create MockTests Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS mock_tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            score INTEGER NOT NULL,
            physics_accuracy REAL NOT NULL,
            chemistry_accuracy REAL NOT NULL,
            maths_accuracy REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Start DB init explicitly on load
init_db()

# ──────────────────────────────────────────────────────────────────────────────
# Storage Logic
# ──────────────────────────────────────────────────────────────────────────────

def record_attempt(user_id: str, question_id: str, subject: str, chapter: str, selected: str, correct: bool) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    import uuid
    attempt_id = str(uuid.uuid4())
    cursor.execute('''
        INSERT INTO attempts (id, user_id, question_id, subject, chapter, selected, correct)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (attempt_id, user_id, question_id, subject, chapter, selected, correct))
    conn.commit()
    conn.close()

def record_mock_test_score(user_id: int, score: int, physics_accuracy: float, chemistry_accuracy: float, maths_accuracy: float):
    """Store the overall result of a mock test."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO mock_tests (user_id, score, physics_accuracy, chemistry_accuracy, maths_accuracy)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, score, physics_accuracy, chemistry_accuracy, maths_accuracy))
    conn.commit()
    conn.close()

def get_dashboard_summary(user_id: int) -> Dict[str, Any]:
    """Calculate and return aggregated dashboard statistics for a user."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Total questions & overall accuracy
    cursor.execute('''
        SELECT 
            COUNT(*) as total_attempts,
            SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as total_correct
        FROM attempts 
        WHERE user_id = ?
    ''', (user_id,))
    totals_row = cursor.fetchone()
    
    total_attempts = totals_row['total_attempts'] or 0
    total_correct = totals_row['total_correct'] or 0
    overall_accuracy = (total_correct / total_attempts) if total_attempts > 0 else 0.0

    # 2. Subject-wise accuracy
    cursor.execute('''
        SELECT 
            subject, 
            COUNT(*) as attempts, 
            SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct
        FROM attempts 
        WHERE user_id = ? AND subject IS NOT NULL
        GROUP BY subject
    ''', (user_id,))
    
    subject_stats = { "physics": 0.0, "chemistry": 0.0, "mathematics": 0.0 }
    
    for row in cursor.fetchall():
        subj = row['subject'].lower()
        subj_total = row['attempts']
        subj_correct = row['correct']
        subj_acc = (subj_correct / subj_total) if subj_total > 0 else 0.0
        if subj in subject_stats:
            subject_stats[subj] = subj_acc

    # 3. Weak Topics (chapters with most incorrect answers)
    cursor.execute('''
        SELECT chapter, COUNT(*) as errors
        FROM attempts
        WHERE user_id = ? AND correct = 0 AND chapter != ''
        GROUP BY chapter
        HAVING errors > 0
        ORDER BY errors DESC
        LIMIT 5
    ''', (user_id,))
    
    weak_chapters = [row['chapter'] for row in cursor.fetchall()]

    # 4. Total mock test count
    cursor.execute('SELECT COUNT(*) as cnt FROM mock_tests WHERE user_id = ?', (user_id,))
    mock_test_count = cursor.fetchone()['cnt'] or 0

    # 5. Mock Test History (Last 10 recent mock tests)
    cursor.execute('''
        SELECT score, physics_accuracy, chemistry_accuracy, maths_accuracy, created_at
        FROM mock_tests
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 10
    ''', (user_id,))
    
    recent_mock_tests = [dict(r) for r in cursor.fetchall()]

    conn.close()

    return {
        "total_attempts": total_attempts,
        "overall_accuracy": overall_accuracy,
        "subject_accuracy": subject_stats,
        "weak_chapters": weak_chapters,
        "mock_test_count": mock_test_count,
        "recent_mock_tests": recent_mock_tests
    }


# ──────────────────────────────────────────────────────────────────────────────
# Standalone Analytics Compute Engine
# ──────────────────────────────────────────────────────────────────────────────

def get_subject_from_id(question_id: str) -> str:
    import re
    match = re.search(r"_q(\d+)$", question_id, re.IGNORECASE)
    if match:
        q_num = int(match.group(1))
        if 1 <= q_num <= 30:
            return "physics"
        elif 31 <= q_num <= 60:
            return "chemistry"
        elif 61 <= q_num <= 90:
            return "mathematics"
    return "unknown"

def compute_accuracy(
    answers: list[dict[str, str]],
    questions_lookup: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    total = 0
    correct = 0

    subject_total: dict[str, int] = {}
    subject_correct: dict[str, int] = {}

    for ans in answers:
        qid = ans.get("question_id", "")
        selected = ans.get("selected", "")

        question = questions_lookup.get(qid)
        if question is None:
            continue

        subject = question.get("subject", get_subject_from_id(qid))
        if not subject or subject == "unknown":
            subject = "unknown"

        total += 1
        subject_total[subject] = subject_total.get(subject, 0) + 1

        if str(question.get("answer", "")).strip() == str(selected).strip():
            correct += 1
            subject_correct[subject] = subject_correct.get(subject, 0) + 1

    subject_accuracy: dict[str, float] = {}
    for subj in subject_total:
        subj_corr = float(subject_correct.get(subj, 0))
        subj_tot = float(subject_total[subj])
        subject_accuracy[subj] = round(subj_corr / subj_tot, 2) if subj_tot > 0 else 0.0

    overall_accuracy = round(float(correct) / float(total), 2) if total > 0 else 0.0

    return {
        "score": correct,
        "total": total,
        "total_accuracy": overall_accuracy,
        "physics_accuracy": subject_accuracy.get("physics", 0.0),
        "chemistry_accuracy": subject_accuracy.get("chemistry", 0.0),
        "maths_accuracy": subject_accuracy.get("mathematics", 0.0),
    }

def find_weak_areas(subject_accuracy: Dict[str, float], threshold: float = 0.60) -> List[str]:
    weak = []
    for subj, acc in subject_accuracy.items():
        if acc < threshold:
            weak.append(subj)
    return weak

def detect_weak_topics(incorrect_answers: List[str], questions_lookup: Dict[str, Dict[str, Any]]) -> Dict[str, List[str]]:
    weak_counts: Dict[str, Dict[str, int]] = {
        subj: {kw: 0 for kw in keywords}
        for subj, keywords in TOPIC_KEYWORDS.items()
    }

    for qid in incorrect_answers:
        q = questions_lookup.get(qid)
        if not q:
            continue

        text = (q.get("question", "") or "").lower()
        subject = (q.get("subject", "") or "unknown").lower()

        subjects_to_check = [subject] if subject in TOPIC_KEYWORDS else list(TOPIC_KEYWORDS.keys())

        for subj in subjects_to_check:
            for keyword in TOPIC_KEYWORDS[subj]:
                if keyword.lower() in text:
                    weak_counts[subj][keyword] += 1

    result_topics: Dict[str, List[str]] = {}
    for subj, counts in weak_counts.items():
        sorted_topics = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        top_topics = [topic for topic, error_count in sorted_topics if error_count > 0]
        if top_topics:
            result_topics[subj] = top_topics[:3]

    return result_topics

def generate_recommendations(weak_topics: Dict[str, List[str]]) -> List[str]:
    recommendations: List[str] = []
    
    for subj, topics in weak_topics.items():
        if topics:
            topics_str = ", ".join(topics)
            if subj == "physics":
                recommendations.append(f"Review core concepts in Physics: {topics_str}.")
            elif subj == "chemistry":
                recommendations.append(f"Practice more Chemistry problems on: {topics_str}.")
            elif subj == "mathematics":
                recommendations.append(f"Focus on Mathematical problem-solving for: {topics_str}.")
            else:
                recommendations.append(f"Practice {subj.capitalize()} topics: {topics_str}.")
                
    if not recommendations:
        recommendations.append("Great job! Keep practicing random mixed sets to maintain your skills.")
        
    return recommendations

def generate_remarks(subject_accuracy: dict[str, float]) -> dict[str, Any]:
    display_names = {
        "physics": "Physics",
        "chemistry": "Chemistry",
        "mathematics": "Mathematics",
        "maths": "Mathematics",
    }

    total_acc = sum(subject_accuracy.values()) / max(1, len(subject_accuracy))
    
    if total_acc > 0.80:
        overall_remark = "Excellent performance"
    elif total_acc >= 0.60:
        overall_remark = "Good but improvement needed"
    else:
        overall_remark = "Needs significant improvement"

    insights: list[str] = []

    for subj, acc in subject_accuracy.items():
        name = display_names.get(subj, subj.title())
        if acc > 0.80:
            insights.append(f"You are strong in {name}")
        elif acc >= 0.60:
            insights.append(f"{name} performance is average")
        else:
            insights.append(f"{name} requires more practice")

    return {
        "overall_remark": overall_remark,
        "insights": insights
    }
