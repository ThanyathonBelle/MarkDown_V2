import json
from collections.abc import AsyncGenerator

import httpx
from fastapi import HTTPException, status

from app.config import Settings


SYSTEM_PROMPT = (
    "You are Markdown AI Studio, an expert technical writing assistant. "
    "Return clean, valid Markdown only. Use GitHub Flavored Markdown when useful. "
    "Do not wrap the entire response in a code fence unless the user explicitly asks for it."
)


class LLMClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.chat_url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.settings.llm_api_key:
            headers["Authorization"] = f"Bearer {self.settings.llm_api_key}"
        return headers

    def _payload(self, messages: list[dict[str, str]], stream: bool) -> dict:
        return {
            "model": self.settings.llm_model,
            "messages": messages,
            "temperature": 0.4,
            "stream": stream,
        }

    async def complete(self, messages: list[dict[str, str]]) -> str:
        try:
            async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                response = await client.post(
                    self.chat_url,
                    headers=self._headers(),
                    json=self._payload(messages, stream=False),
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:1000] or "LLM server returned an error."
            raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not reach LLM server: {exc}",
            ) from exc

        data = response.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LLM server response did not match the OpenAI chat completion format.",
            ) from exc

    async def stream(self, messages: list[dict[str, str]]) -> AsyncGenerator[str, None]:
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    self.chat_url,
                    headers=self._headers(),
                    json=self._payload(messages, stream=True),
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue

                        raw = line.removeprefix("data:").strip()
                        if raw == "[DONE]":
                            break

                        try:
                            event = json.loads(raw)
                            chunk = event["choices"][0].get("delta", {}).get("content")
                        except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                            continue

                        if chunk:
                            yield chunk
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:1000] or "LLM server returned an error."
            raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not reach LLM server: {exc}",
            ) from exc


def generate_messages(prompt: str, content: str | None, mode: str) -> list[dict[str, str]]:
    mode_instruction = {
        "markdown": "Generate a polished Markdown document for the user's prompt.",
        "readme": "Convert the user's material into a production-ready README.md with practical sections.",
        "report": "Convert the user's material into a clear report with summary, findings, and next steps.",
    }[mode]

    user_content = prompt
    if content:
        user_content = f"{prompt}\n\nSource content:\n{content}"

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"{mode_instruction}\n\n{user_content}"},
    ]


def improve_messages(content: str, prompt: str | None) -> list[dict[str, str]]:
    instruction = prompt or "Improve clarity, structure, grammar, and flow while preserving the meaning."
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"{instruction}\n\nMarkdown:\n{content}"},
    ]


def summarize_messages(content: str, prompt: str | None) -> list[dict[str, str]]:
    instruction = prompt or "Summarize this Markdown into a concise, useful Markdown summary."
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"{instruction}\n\nMarkdown:\n{content}"},
    ]
