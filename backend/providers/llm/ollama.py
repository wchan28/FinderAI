"""Ollama LLM provider implementation."""

from __future__ import annotations

from typing import Generator, List, Optional

from backend.providers.llm.base import BaseLLMProvider, Message


class OllamaLLMProvider(BaseLLMProvider):
    """LLM provider using local Ollama models."""

    def __init__(self, model: str = "llama3.1:8b"):
        self._model = model
        self._ollama = None

    def _get_ollama(self):
        """Lazy-load ollama module."""
        if self._ollama is None:
            import ollama
            self._ollama = ollama
        return self._ollama

    @property
    def name(self) -> str:
        return "ollama"

    @property
    def model(self) -> str:
        return self._model

    def generate(
        self,
        messages: List[Message],
        stream: bool = False,
    ) -> str | Generator[str, None, None]:
        ollama = self._get_ollama()
        message_dicts = self._messages_to_dicts(messages)

        if stream:
            return self._stream_response(message_dicts)
        else:
            response = ollama.chat(model=self._model, messages=message_dicts)
            return response["message"]["content"]

    def _stream_response(self, messages: List[dict]) -> Generator[str, None, None]:
        """Stream response chunks from Ollama."""
        ollama = self._get_ollama()
        stream = ollama.chat(model=self._model, messages=messages, stream=True)

        for chunk in stream:
            if "message" in chunk and "content" in chunk["message"]:
                yield chunk["message"]["content"]

    def is_available(self) -> bool:
        """Check if Ollama is running and the model is available."""
        try:
            ollama = self._get_ollama()
            models_response = ollama.list()
            models = models_response.models
            model_names = [m.model.split(":")[0] for m in models if m.model]
            return self._model.split(":")[0] in model_names or len(models) > 0
        except Exception:
            return False

    def list_models(self) -> List[str]:
        """List available Ollama models."""
        try:
            ollama = self._get_ollama()
            models_response = ollama.list()
            return [m.model for m in models_response.models if m.model]
        except Exception:
            return []
