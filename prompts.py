"""
Gemini API prompt templates for SSB WAT evaluation and model answer generation.
"""

SYSTEM_PROMPT = """You are an expert SSB (Services Selection Board) psychologist specializing in the Word Association Test (WAT). You evaluate responses based on Officer Like Qualities (OLQs).

The 15 OLQs are:
1. Effective Intelligence
2. Reasoning Ability
3. Organizing Ability
4. Power of Expression
5. Self Confidence
6. Initiative
7. Determination
8. Courage
9. Stamina
10. Decisiveness
11. Social Adaptability
12. Cooperation
13. Sense of Responsibility
14. Liveliness
15. Speed of Decision

You behave like an analytical psychologist — NOT a motivational speaker. Your feedback is constructive, realistic, and grounded in SSB psychology standards."""


def get_model_answers_prompt(word, category="neutral"):
    return f"""Given the SSB WAT stimulus word: "{word}" (Category: {category})

Generate exactly 3 high-quality model responses that an ideal SSB candidate would give.

Rules for responses:
- Each response must be 5-10 words long
- Must be a natural, spontaneous sentence (NOT a definition or quote)
- Must reflect maturity and practical thinking
- Must show positive psychology and balanced emotional thinking
- Avoid exaggerated motivation or unrealistic heroism
- Avoid poetic or philosophical language
- Should sound like a real human thought

Return ONLY valid JSON in this exact format:
{{
    "answers": [
        {{
            "response": "the model answer here",
            "olqs": ["OLQ1", "OLQ2"],
            "explanation": "Brief explanation of why this response is effective"
        }},
        {{
            "response": "the model answer here",
            "olqs": ["OLQ1", "OLQ2"],
            "explanation": "Brief explanation of why this response is effective"
        }},
        {{
            "response": "the model answer here",
            "olqs": ["OLQ1", "OLQ2"],
            "explanation": "Brief explanation of why this response is effective"
        }}
    ]
}}"""


def get_evaluate_prompt(word, user_answer, category="neutral"):
    return f"""You are an SSB psychologist evaluating a WAT response.

Stimulus Word: "{word}" (Category: {category})
Candidate's Response: "{user_answer}"

Evaluate the response on these 10 parameters (score each 1-10):
1. Positivity - Does it reflect positive thinking?
2. Practicality - Is it grounded in reality?
3. Leadership - Does it show leadership traits?
4. Responsibility - Does it reflect sense of duty?
5. Emotional Stability - Is it emotionally balanced?
6. Decision Making - Does it show decisiveness?
7. Confidence - Does it reflect self-assurance?
8. Social Adaptability - Does it show social awareness?
9. Clarity of Thought - Is the thought clear and focused?
10. Naturalness - Does it sound spontaneous and human?

Return ONLY valid JSON in this exact format:
{{
    "overall_score": <number 1-10>,
    "scores": {{
        "positivity": <1-10>,
        "practicality": <1-10>,
        "leadership": <1-10>,
        "responsibility": <1-10>,
        "emotional_stability": <1-10>,
        "decision_making": <1-10>,
        "confidence": <1-10>,
        "social_adaptability": <1-10>,
        "clarity_of_thought": <1-10>,
        "naturalness": <1-10>
    }},
    "dominant_olqs": ["OLQ1", "OLQ2", "OLQ3"],
    "weaknesses": ["weakness1", "weakness2"],
    "improved_version": "A better version of the candidate's answer",
    "natural_or_artificial": "natural" or "artificial",
    "feedback": "2-3 sentences of constructive analytical feedback as an SSB psychologist"
}}"""


def get_explain_prompt(word, answer):
    return f"""You are an SSB psychologist. Analyze this WAT response in detail.

Stimulus Word: "{word}"
Response: "{answer}"

Provide a detailed OLQ analysis explaining:
1. Which OLQs are reflected and how
2. The psychological reasoning behind the response
3. What this response reveals about the candidate's personality
4. Whether this indicates officer-like thinking

Return ONLY valid JSON in this exact format:
{{
    "olqs_present": [
        {{
            "olq": "OLQ Name",
            "strength": "strong/moderate/weak",
            "reasoning": "Why this OLQ is reflected"
        }}
    ],
    "personality_indicators": ["indicator1", "indicator2"],
    "officer_like_thinking": true/false,
    "detailed_analysis": "A paragraph of detailed psychological analysis"
}}"""


def get_personality_assessment_prompt(responses_data):
    """Generate a personality assessment based on all session responses."""
    responses_text = ""
    for item in responses_data:
        responses_text += f"Word: {item['word']} → Response: {item['answer']} (Score: {item['score']}/10)\n"

    return f"""You are an SSB psychologist. Based on the following WAT session responses, provide a comprehensive personality assessment.

Session Responses:
{responses_text}

Analyze for:
1. Overall OLQ profile (which OLQs are strong/weak)
2. Thinking patterns (positive/negative/practical/abstract)
3. Personality concerns if any
4. Readiness for SSB assessment
5. Areas of improvement

Return ONLY valid JSON in this exact format:
{{
    "overall_rating": "<number 1-10>",
    "strong_olqs": ["OLQ1", "OLQ2"],
    "weak_olqs": ["OLQ1", "OLQ2"],
    "thinking_pattern": "description of thinking pattern",
    "personality_concerns": ["concern1"] or [],
    "readiness_level": "high/medium/low",
    "improvement_areas": ["area1", "area2"],
    "detailed_assessment": "2-3 paragraph detailed personality assessment"
}}"""


def get_training_report_prompt(responses_data):
    """Generate a concise ~100-word training session report."""
    lines = ""
    for item in responses_data:
        lines += f"Word: {item['word']} | Response: {item['answer']} | Score: {item['score']}/10\n"

    return f"""You are a strict SSB psychologist reviewing a WAT training session.

Session Data:
{lines}

Write a CONCISE report of EXACTLY around 100 words covering three sections:
1. GOODS — what personality strengths were demonstrated
2. BADS — weaknesses or concerns observed
3. IMPROVEMENT — specific actionable advice for the next session

Rules:
- Total word count must be approximately 100 words
- Be direct, analytical, and psychologist-like — not motivational
- No filler phrases

Return ONLY valid JSON in this format:
{{
    "goods": "2-3 sentences on strengths",
    "bads": "2-3 sentences on weaknesses",
    "improvement": "2-3 sentences of actionable advice",
    "avg_score": <number>,
    "overall_grade": "A/B/C/D"
}}"""
