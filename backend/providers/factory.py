"""Factory functions for creating provider instances."""

from __future__ import annotations

from typing import Optional

from backend.providers.config import get_config, ProviderConfig
from backend.providers.llm.base import BaseLLMProvider
from backend.providers.llm.ollama import OllamaLLMProvider
from backend.providers.llm.openai import OpenAILLMProvider
from backend.providers.llm.google import GoogleLLMProvider
from backend.providers.embedding.base import BaseEmbeddingProvider
from backend.providers.embedding.cohere import CohereEmbeddingProvider
from backend.providers.embedding.openai import OpenAIEmbeddingProvider
from backend.providers.embedding.voyage import VoyageEmbeddingProvider
from backend.providers.reranking.base import BaseRerankingProvider
from backend.providers.reranking.cohere import CohereRerankingProvider
from backend.providers.reranking.cross_encoder import CrossEncoderRerankingProvider
from backend.providers.reranking.llm_reranker import LLMRerankingProvider
from backend.providers.reranking.none import NoopRerankingProvider


def get_llm_provider(
    config: Optional[ProviderConfig] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> BaseLLMProvider:
    """
    Create an LLM provider based on configuration.

    Args:
        config: Optional ProviderConfig (uses global config if not provided)
        provider: Override the provider from config
        model: Override the model from config

    Returns:
        An LLM provider instance
    """
    if config is None:
        config = get_config()

    provider_name = provider or config.llm_provider
    model_name = model or config.llm_model

    if provider_name == "openai":
        if not config.openai_api_key:
            return OllamaLLMProvider(model="llama3.1:8b")
        return OpenAILLMProvider(
            api_key=config.openai_api_key,
            model=model_name,
        )
    elif provider_name == "google":
        if not config.google_api_key:
            return OllamaLLMProvider(model="llama3.1:8b")
        return GoogleLLMProvider(
            api_key=config.google_api_key,
            model=model_name,
        )
    else:
        return OllamaLLMProvider(model=model_name)


class EmbeddingProviderNotConfiguredError(Exception):
    """Raised when the embedding provider is not configured with required API key."""

    def __init__(self, provider: str):
        self.provider = provider
        super().__init__(f"Embedding provider '{provider}' requires an API key. Please configure it in settings.")


def get_embedding_provider(
    config: Optional[ProviderConfig] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> BaseEmbeddingProvider:
    """
    Create an embedding provider based on configuration.

    Args:
        config: Optional ProviderConfig (uses global config if not provided)
        provider: Override the provider from config
        model: Override the model from config

    Returns:
        An embedding provider instance

    Raises:
        EmbeddingProviderNotConfiguredError: If the provider requires an API key that is not set
    """
    if config is None:
        config = get_config()

    provider_name = provider or config.embedding_provider
    model_name = model or config.embedding_model

    if provider_name == "voyage" and not model_name.startswith("voyage"):
        model_name = "voyage-3-large"
    elif provider_name == "openai" and not model_name.startswith("text-embedding"):
        model_name = "text-embedding-3-large"
    elif provider_name == "cohere" and not model_name.startswith("embed"):
        model_name = "embed-v4.0"

    if provider_name == "voyage":
        if not config.voyage_api_key:
            raise EmbeddingProviderNotConfiguredError("voyage")
        return VoyageEmbeddingProvider(
            api_key=config.voyage_api_key,
            model=model_name,
        )
    elif provider_name == "cohere":
        if not config.cohere_api_key:
            raise EmbeddingProviderNotConfiguredError("cohere")
        return CohereEmbeddingProvider(
            api_key=config.cohere_api_key,
            model=model_name,
        )
    elif provider_name == "openai":
        if not config.openai_api_key:
            raise EmbeddingProviderNotConfiguredError("openai")
        return OpenAIEmbeddingProvider(
            api_key=config.openai_api_key,
            model=model_name,
        )
    else:
        raise EmbeddingProviderNotConfiguredError(provider_name)


def get_reranking_provider(
    config: Optional[ProviderConfig] = None,
    provider: Optional[str] = None,
    llm_provider: Optional[BaseLLMProvider] = None,
) -> BaseRerankingProvider:
    """
    Create a reranking provider based on configuration.

    Args:
        config: Optional ProviderConfig (uses global config if not provided)
        provider: Override the provider from config
        llm_provider: LLM provider for LLM-based reranking

    Returns:
        A reranking provider instance
    """
    if config is None:
        config = get_config()

    provider_name = provider or config.reranking_provider

    if provider_name == "cohere":
        if not config.cohere_api_key:
            return NoopRerankingProvider()
        return CohereRerankingProvider(
            api_key=config.cohere_api_key,
            model=config.reranking_model,
        )
    elif provider_name == "cross_encoder":
        return CrossEncoderRerankingProvider()
    elif provider_name == "llm":
        if llm_provider is None:
            llm_provider = get_llm_provider(config)
        return LLMRerankingProvider(llm_provider)
    else:
        return NoopRerankingProvider()
