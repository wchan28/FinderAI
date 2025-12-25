"""OpenAI LLM provider implementation."""

from __future__ import annotations

from typing import Generator, List, Optional

from backend.providers.llm.base import BaseLLMProvider, Message


OPENAI_MODELS = [
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5.1-mini",
    "gpt-5",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o3-mini",
    "o1",
    "o1-mini",
]


class OpenAILLMProvider(BaseLLMProvider):
    """LLM provider using OpenAI API."""

    def __init__(self, api_key: str, model: str = "gpt-5.1"):
        self._api_key = api_key
        self._model = model
        self._client = None

    def _get_client(self):
        """Lazy-load OpenAI client."""
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(api_key=self._api_key)
        return self._client

    @property
    def name(self) -> str:
        return "openai"

    @property
    def model(self) -> str:
        return self._model

    def generate(
        self,
        messages: List[Message],
        stream: bool = False,
    ) -> str | Generator[str, None, None]:
        client = self._get_client()
        message_dicts = self._messages_to_dicts(messages)

        if stream:
            return self._stream_response(message_dicts)
        else:
            response = client.chat.completions.create(
                model=self._model,
                messages=message_dicts,
            )
            return response.choices[0].message.content or ""

    def _stream_response(self, messages: List[dict]) -> Generator[str, None, None]:
        """Stream response chunks from OpenAI."""
        client = self._get_client()
        stream = client.chat.completions.create(
            model=self._model,
            messages=messages,
            stream=True,
        )

        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    def is_available(self) -> bool:
        """Check if API key is configured and valid."""
        if not self._api_key:
            return False
        try:
            client = self._get_client()
            client.models.list()
            return True
        except Exception:
            return bool(self._api_key)

    def list_models(self) -> List[str]:
        """List available OpenAI models."""
        return OPENAI_MODELS.copy()
