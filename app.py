"""
SSB WAT Practice — Flask Application
AI-powered Word Association Test practice with Groq API integration.
"""

import os
import json
from flask import Flask, render_template, request, jsonify, send_from_directory
from dotenv import load_dotenv
from groq import Groq

from words import get_words, get_word_category, get_all_categories
from prompts import (
    SYSTEM_PROMPT,
    get_model_answers_prompt,
    get_evaluate_prompt,
    get_explain_prompt,
    get_personality_assessment_prompt,
    get_training_report_prompt,
)

load_dotenv()

app = Flask(__name__)

# Initialize Groq client
# Fallback to empty string so the Vercel server doesn't crash on boot if keys aren't set yet
client = Groq(api_key=os.getenv("GROQ_API_KEY", "missing_key"))
MODEL = "llama-3.3-70b-versatile"


def call_groq(prompt):
    """Call Groq API and return parsed JSON response."""
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content.strip()
        # Clean markdown fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
        return json.loads(text)
    except json.JSONDecodeError:
        return {"error": "Failed to parse AI response"}
    except Exception as e:
        return {"error": str(e)}


# ── Routes ──────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/words", methods=["GET"])
def api_get_words():
    """Get words by category."""
    category = request.args.get("category", "random")
    count = int(request.args.get("count", 10))
    words = get_words(category, count)
    return jsonify({"words": words, "total": len(words)})


@app.route("/api/categories", methods=["GET"])
def api_get_categories():
    """Get all available categories with word counts."""
    return jsonify(get_all_categories())


@app.route("/api/evaluate", methods=["POST"])
def api_evaluate():
    """Evaluate user's answer using Groq AI."""
    data = request.get_json()
    word = data.get("word", "")
    answer = data.get("answer", "")
    category = data.get("category", "neutral")

    if not word or not answer:
        return jsonify({"error": "Word and answer are required"}), 400

    prompt = get_evaluate_prompt(word, answer, category)
    result = call_groq(prompt)

    # Normalise keys so frontend always gets consistent fields
    if "error" not in result:
        result.setdefault("score", result.pop("overall_score", 7))
        result.setdefault("naturalness", result.pop("natural_or_artificial", "Natural").capitalize())
        result.setdefault("dominant_olqs", [])
        result.setdefault("weaknesses", [])
        result.setdefault("improved_version", "")
        result.setdefault("assessment", result.pop("feedback", ""))

    return jsonify(result)


@app.route("/api/model-answers", methods=["POST"])
def api_model_answers():
    """Generate 3 model answers for a given word."""
    data = request.get_json()
    word = data.get("word", "")
    category = data.get("category", "neutral")

    if not word:
        return jsonify({"error": "Word is required"}), 400

    prompt = get_model_answers_prompt(word, category)
    result = call_groq(prompt)

    # Normalise: frontend expects { model_answers: [{sentence, olqs, explanation}] }
    if "error" not in result:
        raw = result.get("answers", [])
        model_answers = []
        for item in raw:
            model_answers.append({
                "sentence": item.get("response", ""),
                "olqs": item.get("olqs", []),
                "explanation": item.get("explanation", ""),
            })
        return jsonify({"model_answers": model_answers})

    return jsonify(result)


@app.route("/api/explain", methods=["POST"])
def api_explain():
    """Get detailed OLQ explanation for a response."""
    data = request.get_json()
    word = data.get("word", "")
    answer = data.get("answer", "")

    if not word or not answer:
        return jsonify({"error": "Word and answer are required"}), 400

    prompt = get_explain_prompt(word, answer)
    result = call_groq(prompt)
    return jsonify(result)


@app.route("/api/personality-assessment", methods=["POST"])
def api_personality_assessment():
    """Generate personality assessment from full session data."""
    data = request.get_json()
    responses = data.get("responses", [])

    if not responses:
        return jsonify({"error": "No responses provided"}), 400

    prompt = get_personality_assessment_prompt(responses)
    result = call_groq(prompt)
    return jsonify(result)


@app.route("/api/word-category", methods=["GET"])
def api_word_category():
    """Get category for a custom word."""
    word = request.args.get("word", "")
    category = get_word_category(word)
    return jsonify({"word": word, "category": category})


@app.route("/api/training-report", methods=["POST"])
def api_training_report():
    """Generate a concise ~100-word session report from all training responses."""
    data = request.get_json()
    responses = data.get("responses", [])

    if not responses:
        return jsonify({"error": "No responses provided"}), 400

    prompt = get_training_report_prompt(responses)
    result = call_groq(prompt)
    return jsonify(result)


@app.route("/api/firebase-config", methods=["GET"])
def api_firebase_config():
    """Securely pass Firebase credentials to the browser dynamic scripts."""
    return jsonify({
        "apiKey": os.getenv("FIREBASE_API_KEY", ""),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
        "projectId": os.getenv("FIREBASE_PROJECT_ID", ""),
        "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", ""),
        "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID", ""),
        "appId": os.getenv("FIREBASE_APP_ID", "")
    })


@app.route("/tat-images/<path:filename>")
def serve_tat_images(filename):
    """Serve TAT practice images from the root tat-images directory."""
    return send_from_directory(os.path.join(app.root_path, "tat-images"), filename)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
