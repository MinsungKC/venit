import json
import requests

raw_resume_text = extract_text_from_pdf_buffer(uploaded_file) # PURGED IMMEDIATELY
with open("interests.json", "r") as f:
    ALLOWED_INTERESTS = json.load(f)

with open("personalities.json", "r") as f:
    ALLOWED_PERSONALITIES = json.load(f)

print(ALLOWED_INTERESTS)
print(ALLOWED_PERSONALITIES)

prompt = f"""
    Analyze the user profile and map them STRICTLY to the allowed tags. 
    A user must only recieve one personality tag, but can recieve multiple interest tags.

    Interests: {', '.join(ALLOWED_INTERESTS)}
    Personalities: {', '.join(ALLOWED_PERSONALITIES)}

    User Profile:
    - Self-Adjectives: 
    - Selected Interests:
    - Resume Snippet: {raw_resume_text[:2000]}

    Return JSON only: 
    {{
        "interest_tags": ["tag1", "tag2", "tag3", etc]
        "personality_tag": "tag"
    }}
"""



response = requests.post("https://api.example.com/generate", json={
    "model": "llama3.2:3b",
    "prompt": prompt,
    "format": "json",
    "stream": False
})

output = json.loads(response.json()['response'])
print("Tags generated:", output)