import logging
import os
import secrets

from dotenv import load_dotenv
from flask import Flask, jsonify, request, session
import requests
from groq import Groq

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SESSION_SECRET", "change-this-session-secret")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
message_log = []
scheduled_posts = []

FACEBOOK_ACCESS_TOKEN = os.getenv("FB_ACCESS_TOKEN")
PAGE_ID = os.getenv("FB_PAGE_ID")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
VERIFY_TOKEN = os.getenv("FB_VERIFY_TOKEN", "my_secure_token_123")
GRAPH_API_VERSION = os.getenv("FB_GRAPH_API_VERSION", "v26.0")
DASHBOARD_USERNAME = os.getenv("DASHBOARD_USERNAME", "admin")
DASHBOARD_PASSWORD = os.getenv("DASHBOARD_PASSWORD", "change-me-now")

def resolve_page_credentials():
    if not FACEBOOK_ACCESS_TOKEN:
        return None, PAGE_ID

    try:
        response = requests.get(
            f"https://graph.facebook.com/{GRAPH_API_VERSION}/me/accounts",
            params={
                "access_token": FACEBOOK_ACCESS_TOKEN,
                "fields": "id,access_token",
            },
            timeout=15,
        )
        response.raise_for_status()
        pages = response.json().get("data", [])
        page = next((item for item in pages if item.get("id") == PAGE_ID), None)
        page = page or (pages[0] if pages else None)
        if page and page.get("access_token"):
            logger.info("Using Facebook Page ID %s", page.get("id"))
            return page["access_token"], page.get("id")
    except requests.RequestException as error:
        logger.error("Could not resolve a Facebook Page token: %s", error)

    return FACEBOOK_ACCESS_TOKEN, PAGE_ID


PAGE_ACCESS_TOKEN, PAGE_ID = resolve_page_credentials()
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

if not PAGE_ACCESS_TOKEN:
    logger.warning("FB_ACCESS_TOKEN is not configured; Facebook replies will fail")
if not GROQ_API_KEY:
    logger.warning("GROQ_API_KEY is not configured; AI replies will use the fallback message")


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = os.getenv("FRONTEND_ORIGIN", "*")
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

@app.route('/', methods=['GET'])
def home():
    return "Flask server is running successfully!", 200

@app.route('/webhook', methods=['GET'])
def verify_webhook():
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')

    if mode and token:
        if mode == 'subscribe' and token == VERIFY_TOKEN:
            return challenge, 200
        else:
            return 'Verification token mismatch', 403
    return 'Bad request', 400

@app.route('/webhook', methods=['POST'])
def handle_webhook():
    data = request.get_json(silent=True) or {}
    
    if data and data.get('object') == 'page':
        for entry in data.get('entry', []):
            for event in entry.get('messaging', []):
                message = event.get('message', {})
                sender = event.get('sender', {})
                message_text = message.get('text')

                if not message_text or not sender.get('id') or message.get('is_echo'):
                    continue

                logger.info("Received message from %s: %s", sender['id'], message_text)
                message_log.append({
                    "id": event.get("message", {}).get("mid", f"message-{len(message_log) + 1}"),
                    "sender_id": sender["id"],
                    "text": message_text,
                    "received_at": event.get("timestamp"),
                })
                ai_response = generate_ai_response(message_text)
                send_facebook_message(sender['id'], ai_response)

        return "EVENT_RECEIVED", 200
    return "Not a page event", 404


@app.route('/api/health', methods=['GET'])
def api_health():
    return jsonify({"status": "ok", "page_id": PAGE_ID, "webhook": True})


@app.route('/api/auth/session', methods=['GET'])
def auth_session():
    return jsonify({"authenticated": bool(session.get("dashboard_authenticated"))})


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", ""))
    password = str(payload.get("password", ""))
    if not secrets.compare_digest(username, DASHBOARD_USERNAME) or not secrets.compare_digest(password, DASHBOARD_PASSWORD):
        return jsonify({"error": "Invalid username or password"}), 401
    session["dashboard_authenticated"] = True
    return jsonify({"authenticated": True})


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    session.pop("dashboard_authenticated", None)
    return jsonify({"authenticated": False})


def dashboard_required():
    if not session.get("dashboard_authenticated"):
        return jsonify({"error": "Authentication required"}), 401
    return None


@app.route('/api/conversations', methods=['GET'])
def api_conversations():
    unauthorized = dashboard_required()
    if unauthorized:
        return unauthorized
    return jsonify({"conversations": list(reversed(message_log[-50:]))})


@app.route('/api/messages/<recipient_id>', methods=['POST', 'OPTIONS'])
def api_send_message(recipient_id):
    if request.method == 'OPTIONS':
        return '', 204
    unauthorized = dashboard_required()
    if unauthorized:
        return unauthorized
    payload = request.get_json(silent=True) or {}
    message_text = str(payload.get('message', '')).strip()
    if not message_text:
        return jsonify({"error": "message is required"}), 400
    if not send_facebook_message(recipient_id, message_text):
        return jsonify({"error": "Facebook rejected the message"}), 502
    return jsonify({"status": "sent"}), 200


@app.route('/api/posts', methods=['POST', 'OPTIONS'])
def api_create_post():
    if request.method == 'OPTIONS':
        return '', 204
    unauthorized = dashboard_required()
    if unauthorized:
        return unauthorized
    payload = request.get_json(silent=True) or {}
    post_text = str(payload.get('message', '')).strip()
    if not post_text or not PAGE_ACCESS_TOKEN:
        return jsonify({"error": "message and Page access are required"}), 400
    response = requests.post(
        f"https://graph.facebook.com/{GRAPH_API_VERSION}/{PAGE_ID}/feed",
        params={"access_token": PAGE_ACCESS_TOKEN},
        data={"message": post_text},
        timeout=15,
    )
    if not response.ok:
        logger.error("Facebook post failed: %s", response.text)
        return jsonify({"error": "Facebook rejected the post"}), 502
    return jsonify({"status": "published", "post": response.json()}), 201


@app.route('/api/posts/schedule', methods=['POST', 'OPTIONS'])
def api_schedule_post():
    if request.method == 'OPTIONS':
        return '', 204
    unauthorized = dashboard_required()
    if unauthorized:
        return unauthorized
    payload = request.get_json(silent=True) or {}
    post_text = str(payload.get('message', '')).strip()
    publish_at = str(payload.get('publish_at', '')).strip()
    if not post_text or not publish_at:
        return jsonify({"error": "message and publish_at are required"}), 400
    item = {"id": f"scheduled-{len(scheduled_posts) + 1}", "message": post_text, "publish_at": publish_at, "status": "scheduled"}
    scheduled_posts.append(item)
    return jsonify(item), 201

def generate_ai_response(prompt):
    if client is None:
        logger.error("GROQ_API_KEY is not configured")
        return "Thanks for messaging WK Digital Solutions! We will get back to you shortly."

    try:
        completion = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
            messages=[
    {
        "role": "system", 
        "content": (
            "You are a helpful customer support assistant for WK Digital Solutions, a digital agency "
            "specializing in clean, fast, mobile-ready web development. "
            "Our official contact details are: "
            "Phone/WhatsApp: 0307 5096329, "
            "Email: muhammad.wasim1@gmail.com, "
            "Location: Wah Cantt, Pakistan. "
            "Always provide these exact details when customers ask for contact info or phone numbers."
        )
    },
    {"role": "user", "content": prompt}
],
            temperature=0.7,
            max_tokens=300
        )
        return completion.choices[0].message.content
    except Exception as e:
        logger.exception("AI request failed: %s", e)
        return "Thanks for messaging WK Digital Solutions! We will get back to you shortly."

def send_facebook_message(recipient_id, message_text):
    if not PAGE_ACCESS_TOKEN:
        logger.error("FB_ACCESS_TOKEN is not configured")
        return False

    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{PAGE_ID}/messages"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": message_text}
    }
    try:
        response = requests.post(
            url,
            params={"access_token": PAGE_ACCESS_TOKEN},
            json=payload,
            timeout=15,
        )
        response.raise_for_status()
        logger.info("Response sent successfully to %s", recipient_id)
        return True
    except requests.RequestException as error:
        logger.error("Facebook message send failed: %s", error)
        return False


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)