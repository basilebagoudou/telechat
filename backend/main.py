"""Content moderation endpoint, deployed by Vercel as a Python Serverless Function.

Runs a lightweight keyword filter by default. If ANTHROPIC_API_KEY is set, it
instead asks Claude to classify the message, which catches things a keyword
list can't (harassment, threats, spam patterns, etc).
"""

import json
import os
import re

from flask import Flask, jsonify, request

app = Flask(__name__)

BANNED_TERMS = [
    "badword1",
    "badword2",
]


def keyword_flag(content: str) -> bool:
    lowered = content.lower()
    return any(re.search(rf"\b{re.escape(term)}\b", lowered) for term in BANNED_TERMS)


def llm_flag(content: str) -> bool | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=5,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Reply with only YES or NO. Should this chat message be "
                        "flagged for moderation (harassment, hate speech, threats, "
                        "spam, or sexual content involving minors)?\n\n"
                        f"Message: {content!r}"
                    ),
                }
            ],
        )
        answer = message.content[0].text.strip().upper()
        return answer.startswith("YES")
    except Exception:
        return None


@app.route("/api/py/moderate", methods=["POST"])
def moderate():
    body = request.get_json(silent=True) or {}
    content = str(body.get("content", ""))[:4000]

    if not content.strip():
        return jsonify({"flagged": False})

    flagged = llm_flag(content)
    if flagged is None:
        flagged = keyword_flag(content)

    return jsonify({"flagged": flagged})
