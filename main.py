"""
JEE Smart Practice — FastAPI Backend (FULL VERSION - RENDER READY)
"""

import json
import random
import os
from typing import Annotated, Any, Optional

from fastapi import FastAPI, Depends, HTTPException, Security, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, EmailStr

import auth
import analytics
import question_engine

from analytics import (
    compute_accuracy,
    generate_remarks,
    find_weak_areas,
    detect_weak_topics,
    generate_recommendations,
)

# ─────────────────────────────────────────────
# App Setup
# ─────────────────────────────────────────────
app = FastAPI(title="JEE Smart Practice", version="2.1")

templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

os.makedirs("images", exist_ok=True)
app.mount("/images", StaticFiles(directory="images"), name="images")

# Auth types
CurrentUser = Annotated[dict, Depends(auth.get_current_user)]
OptionalUser = Annotated[Optional[dict], Depends(auth.get_current_user_optional)]

# ─────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────
class AnswerCheck(BaseModel):
    question_id: str
    selected: str

class MockTestAnswer(BaseModel):
    question_id: str
    selected: str

class MockTestSubmission(BaseModel):
    answers: list[MockTestAnswer]

class CustomMockTest(BaseModel):
    subjects: list[str]
    questions_per_subject: int

class ChatMessage(BaseModel):
    message: str

class WeakTopicsRequest(BaseModel):
    weak_topics: dict[str, list[str]]

class ExplanationRequest(BaseModel):
    question_id: str
    selected: str

class UserSignup(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

# ─────────────────────────────────────────────
# Pages
# ─────────────────────────────────────────────
@app.get("/")
def landing_page(request: Request):
    return templates.TemplateResponse(request=request, name="landing.html")

@app.get("/login")
def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html", context={"mode": "login"})

@app.get("/signup-page")
def signup_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html", context={"mode": "signup"})

@app.get("/dashboard")
def dashboard_page(request: Request):
    return templates.TemplateResponse(request=request, name="dashboard.html")

@app.get("/app")
def app_page(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

# ─────────────────────────────────────────────
# Auth APIs
# ─────────────────────────────────────────────
@app.post("/signup")
def signup(data: UserSignup):
    try:
        user = auth.create_user(data.name, data.email, data.password)
        auth_data = auth.authenticate_user(data.email, data.password)
        return {"user": user, "token": auth_data["session_token"]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/login")
def login(data: UserLogin):
    user_data = auth.authenticate_user(data.email, data.password)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {
        "user": {
            "id": user_data["id"],
            "name": user_data["name"],
            "email": user_data["email"]
        },
        "token": user_data["session_token"]
    }

@app.post("/logout")
def logout(current_user: OptionalUser, token=Security(auth.security)):
    if current_user and token:
        auth.clear_session(token.credentials)
    return {"message": "Logged out successfully"}

# ─────────────────────────────────────────────
# Dashboard
# ─────────────────────────────────────────────
@app.get("/api/dashboard")
def get_dashboard_data(current_user: CurrentUser):
    return analytics.get_dashboard_summary(current_user["id"])

@app.get("/user/profile")
def get_profile(current_user: CurrentUser):
    stats = analytics.get_dashboard_summary(current_user["id"])
    return {"user": current_user, "stats": stats}

# ─────────────────────────────────────────────
# Practice
# ─────────────────────────────────────────────
@app.get("/question")
def get_question(current_user: CurrentUser):
    conn = analytics.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT question_id FROM attempts WHERE user_id = ?", (current_user["id"],))
    attempted_ids = {row["question_id"] for row in cursor.fetchall()}
    conn.close()

    pool = [q for q in question_engine.questions if q["id"] not in attempted_ids]
    if not pool:
        pool = question_engine.questions

    q = random.choice(pool)
    return q

@app.post("/check")
def check_answer(data: AnswerCheck, current_user: CurrentUser):
    question = question_engine.questions_lookup.get(data.question_id)
    if question is None:
        return JSONResponse(status_code=404, content={"error": "Question not found"})

    correct = str(question["answer"]).strip() == str(data.selected).strip()

    weak_topic_dict = detect_weak_topics([data.question_id], question_engine.questions_lookup)
    subject = question.get("subject", "unknown").lower()
    topic = weak_topic_dict.get(subject, [""])[0] if weak_topic_dict.get(subject) else ""

    analytics.record_attempt(
        user_id=current_user["id"],
        question_id=data.question_id,
        subject=subject,
        chapter=topic,
        selected=data.selected,
        correct=correct
    )

    return {"correct": correct, "answer": question["answer"]}

# ─────────────────────────────────────────────
# Explanation
# ─────────────────────────────────────────────
def _generate_explanation(question: dict[str, Any], selected: str) -> str:
    q_text = (question.get("question") or "").strip()
    subject = (question.get("subject") or "question").capitalize()

    correct_key = str(question.get("answer"))
    return f"Correct answer is {correct_key}. Review concept carefully."

@app.post("/explanation")
def explanation(payload: ExplanationRequest, current_user: CurrentUser):
    question = question_engine.questions_lookup.get(payload.question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")

    text = _generate_explanation(question, payload.selected)
    return {"explanation": text}

@app.get("/important_topics")
def important_topics(current_user: CurrentUser):
    return question_engine.get_important_topics(question_engine.questions, top_n=5)

# ─────────────────────────────────────────────
# Mock Test
# ─────────────────────────────────────────────
@app.get("/mock_test")
def get_mock_test(current_user: CurrentUser):
    test_questions = question_engine.generate_mock_test(30, 30, 30)
    return {"total": len(test_questions), "questions": test_questions}

@app.post("/mock_test")
def custom_mock_test(data: CustomMockTest, current_user: CurrentUser):
    n_phy = data.questions_per_subject if "physics" in data.subjects else 0
    n_chem = data.questions_per_subject if "chemistry" in data.subjects else 0
    n_math = data.questions_per_subject if "mathematics" in data.subjects else 0
    test_questions = question_engine.generate_mock_test(n_phy, n_chem, n_math)
    return {"total": len(test_questions), "questions": test_questions}

@app.post("/submit_mock_test")
def submit_mock_test(submission: MockTestSubmission, current_user: CurrentUser):
    answers = [{"question_id": a.question_id, "selected": a.selected} for a in submission.answers]

    result = compute_accuracy(answers, question_engine.questions_lookup)

    remarks_data = generate_remarks({
        "physics": result["physics_accuracy"],
        "chemistry": result["chemistry_accuracy"],
        "mathematics": result["maths_accuracy"]
    })

    incorrect_answers = []
    for a in submission.answers:
        q = question_engine.questions_lookup.get(a.question_id)
        if q and str(q.get("answer", "")).strip() != str(a.selected).strip():
            incorrect_answers.append(a.question_id)

    weak_topics = detect_weak_topics(incorrect_answers, question_engine.questions_lookup)
    recommendations = generate_recommendations(weak_topics)

    analytics.record_mock_test_score(
        current_user["id"],
        result["score"],
        result["physics_accuracy"],
        result["chemistry_accuracy"],
        result["maths_accuracy"]
    )

    return {
        "score": result["score"],
        "total": result["total"],
        "total_accuracy": result["total_accuracy"],
        "physics_accuracy": result["physics_accuracy"],
        "chemistry_accuracy": result["chemistry_accuracy"],
        "maths_accuracy": result["maths_accuracy"],
        "remarks": remarks_data["overall_remark"],
        "insights": remarks_data["insights"],
        "weak_topics": weak_topics,
        "recommendation": recommendations
    }

# ─────────────────────────────────────────────
# Chatbot
# ─────────────────────────────────────────────
@app.post("/chat/{subject}")
def chat_subject(subject: str, msg: ChatMessage, current_user: CurrentUser):
    import chatbot
    return {"response": chatbot.generate_response(msg.message, subject)}

# ─────────────────────────────────────────────
# Health Check (IMPORTANT FOR RENDER)
# ─────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}
