"""OpenAI wrapper: embeddings + [LLM-ASSIST] verdicts (rubric sections 6, 8, 10).

Env: OPENAI_API_KEY. When the key is missing (or --no-llm is passed),
get_llm_client() returns a NullLLM whose .available is False — callers must
then score 0 with evidence "skipped (no API key)" per the task spec.
Determinism: temperature 0, fixed model names from config.
"""
import os

from . import config


class BaseLLM:
    available = False

    def embed(self, texts):
        raise NotImplementedError

    def verdict(self, question, chunk):
        """(answered: bool, quote: str|None)."""
        raise NotImplementedError

    def classify_niche(self, title, h1s, nav_labels, snippet, niches):
        """Return a niche slug from `niches`, or None."""
        raise NotImplementedError


class NullLLM(BaseLLM):
    available = False

    def embed(self, texts):
        return None

    def verdict(self, question, chunk):
        return (False, None)

    def classify_niche(self, title, h1s, nav_labels, snippet, niches):
        return None


class OpenAILLM(BaseLLM):
    available = True

    def __init__(self, api_key):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key)

    def embed(self, texts):
        texts = [t[:8000] for t in texts]
        resp = self.client.embeddings.create(
            model=config.LLM_EMBEDDING_MODEL, input=texts)
        return [d.embedding for d in resp.data]

    def verdict(self, question, chunk):
        prompt = (
            "Does this text directly answer the question? Reply YES or NO. "
            "If YES, copy the single sentence that answers it, exactly.\n\n"
            f"Question: {question}\n\nText: {chunk[:4000]}"
        )
        resp = self.client.chat.completions.create(
            model=config.LLM_VERDICT_MODEL,
            temperature=config.LLM_TEMPERATURE,
            messages=[{"role": "user", "content": prompt}],
        )
        out = (resp.choices[0].message.content or "").strip()
        first = out.splitlines()[0].strip().upper() if out else ""
        if not first.startswith("YES"):
            return (False, None)
        # the quote: first non-empty line after the YES line, else remainder
        rest = "\n".join(out.splitlines()[1:]).strip()
        quote = rest.split("\n")[0].strip().strip('"') if rest else None
        if quote and quote in chunk:
            return (True, quote)
        return (False, None)  # quote failed substring validation -> NO

    def classify_niche(self, title, h1s, nav_labels, snippet, niches):
        prompt = (
            "Classify this business into exactly one of these niches. "
            "Reply with ONLY the niche slug, nothing else. "
            "If none fits, reply: unknown\n\n"
            f"Niches: {', '.join(niches)}\n\n"
            f"Title: {title}\nH1s: {'; '.join(h1s[:3])}\n"
            f"Nav: {'; '.join(nav_labels[:12])}\nText: {snippet[:1200]}"
        )
        try:
            resp = self.client.chat.completions.create(
                model=config.LLM_VERDICT_MODEL,
                temperature=config.LLM_TEMPERATURE,
                messages=[{"role": "user", "content": prompt}],
            )
            ans = (resp.choices[0].message.content or "").strip().lower()
            return ans if ans in niches else None
        except Exception:
            return None


def get_llm_client(no_llm=False):
    if no_llm:
        return NullLLM()
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        return NullLLM()
    try:
        return OpenAILLM(key)
    except Exception:
        return NullLLM()


def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)
