"""Google Gemini LLM provider implementation."""

from __future__ import annotations

from typing import Generator, List, Optional

from backend.providers.llm.base import BaseLLMProvider, Message


GOOGLE_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-preview-05-20",
    "gemini-3-flash-preview",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
]


class GoogleLLMProvider(BaseLLMProvider):
    """LLM provider using Google Gemini API."""

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        self._api_key = api_key
        self._model = model
        self._client = None

    def _get_client(self):
        """Lazy-load Google Generative AI client."""
        if self._client is None:
            import google.generativeai as genai
            genai.configure(api_key=self._api_key)
            self._client = genai
        return self._client

    @property
    def name(self) -> str:
        return "google"

    @property
    def model(self) -> str:
        return self._model

    def generate(
        self,
        messages: List[Message],
        stream: bool = False,
    ) -> str | Generator[str, None, None]:
        genai = self._get_client()

        system_instruction = None
        chat_messages = []

        for msg in messages:
            if msg.role == "system":
                system_instruction = msg.content
            elif msg.role == "user":
                chat_messages.append({"role": "user", "parts": [msg.content]})
            elif msg.role == "assistant":
                chat_messages.append({"role": "model", "parts": [msg.content]})

        model = genai.GenerativeModel(
            model_name=self._model,
            system_instruction=system_instruction,
        )

        if stream:
            return self._stream_response(model, chat_messages)
        else:
            if len(chat_messages) == 1:
                response = model.generate_content(chat_messages[0]["parts"][0])
            else:
                chat = model.start_chat(history=chat_messages[:-1])
                response = chat.send_message(chat_messages[-1]["parts"][0])
            return response.text

    def _stream_response(self, model, messages: List[dict]) -> Generator[str, None, None]:
        """Stream response chunks from Gemini."""
        if len(messages) == 1:
            response = model.generate_content(
                messages[0]["parts"][0],
                stream=True,
            )
        else:
            chat = model.start_chat(history=messages[:-1])
            response = chat.send_message(
                messages[-1]["parts"][0],
                stream=True,
            )

        for chunk in response:
            if chunk.text:
                yield chunk.text

    def is_available(self) -> bool:
        """Check if API key is configured."""
        if not self._api_key:
            return False
        try:
            genai = self._get_client()
            list(genai.list_models())
            return True
        except Exception:
            return bool(self._api_key)

    def list_models(self) -> List[str]:
        """List available Gemini models."""
        return GOOGLE_MODELS.copy()
