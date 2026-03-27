import os
import google.generativeai as genai
from typing import Optional

# Ensure exact name match for system prompts
SYSTEM_PROMPTS = {
    "physics": (
        "You are an expert Physics tutor for the JEE Main and Advanced exam. "
        "Your goal is to provide conceptual explanations and intuition. "
        "When explaining, start with the core principle (e.g., Newton's Laws, Gauss's Law), "
        "help the student visualize the problem, and keep math steps clear. "
        "If a topic is requested, list high-yield concepts associated with it."
    ),
    "chemistry": (
        "You are an expert Chemistry tutor for the JEE Main and Advanced exam. "
        "Your focus is on reactions, theory, and chemical intuition. "
        "For organic chemistry, emphasize electron flow and stability; for physical, emphasize formulas and units; "
        "for inorganic, emphasize periodic trends and exceptions."
    ),
    "mathematics": (
        "You are an expert Mathematics tutor for the JEE Main and Advanced exam. "
        "Your goal is to outline step-by-step mathematical reasoning. "
        "Guide the student through translating the problem into equations, simplifying expressions, "
        "and performing calculus, algebra, or geometry safely without skipping crucial steps."
    )
}

def generate_response(message: str, subject: str) -> str:
    """
    Generates a response from the Google Gemini API based on the specific JEE subject.
    Returns the generated str response or an error fallback.
    """
    from dotenv import load_dotenv
    load_dotenv(override=True)
    
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return "⚠️ Error: GEMINI_API_KEY is not set in the environment. Please configure your API key to use the AI tutor."
        
    try:
        genai.configure(api_key=api_key)
        
        # Use gemini-2.5-flash as the api key's permitted tier model
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=SYSTEM_PROMPTS.get(subject.lower(), "You are a helpful AI tutor for JEE preparation.")
        )
        
        response = model.generate_content(message)
        return response.text
        
    except Exception as e:
        error_msg = str(e)
        if "API_KEY_INVALID" in error_msg or "API key not valid" in error_msg:
            return "⚠️ Setup Needed: The GEMINI_API_KEY inside your `.env` file is currently a placeholder or invalid. Please open the `.env` file and paste a real API key from Google AI Studio to use the chatbot."
        return f"⚠️ Chatbot Error: Failed to generate a response from Gemini API. Details: {error_msg}"
