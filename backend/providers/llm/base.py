"""Base class for LLM providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Generator, List, Literal, Optional


@dataclass
class Message:
    """A message in a conversation."""

    role: Literal["system", "user", "assistant"]
    content: str


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Return the provider name."""
        pass

    @property
    @abstractmethod
    def model(self) -> str:
        """Return the current model name."""
        pass

    @abstractmethod
    def generate(
        self,
        messages: List[Message],
        stream: bool = False,
    ) -> str | Generator[str, None, None]:
        """
        Generate a response from the LLM.

        Args:
            messages: List of messages in the conversation
            stream: If True, return a generator that yields response chunks

        Returns:
            The complete response string, or a generator yielding chunks
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if the provider is available and configured."""
        pass

    @abstractmethod
    def list_models(self) -> List[str]:
        """List available models for this provider."""
        pass

    def _messages_to_dicts(self, messages: List[Message]) -> List[dict]:
        """Convert Message objects to dicts for API calls."""
        return [{"role": m.role, "content": m.content} for m in messages]
