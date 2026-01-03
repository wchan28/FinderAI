"""Proxy client for Supabase Edge Function API calls.

Routes LLM, embedding, and reranking requests through Supabase Edge Functions
where API keys are securely stored as secrets.
"""

from __future__ import annotations

import json
from typing import Any, Generator, List, Optional

import httpx

from backend.providers.config import get_clerk_token, get_proxy_url


class ProxyError(Exception):
    """Error from proxy request."""
    pass


def _get_headers() -> dict[str, str]:
    """Get headers for proxy requests including Clerk auth token."""
    headers = {
        "Content-Type": "application/json",
    }
    clerk_token = get_clerk_token()
    if clerk_token:
        headers["x-clerk-auth-token"] = clerk_token
    return headers


def proxy_llm_chat(
    messages: List[dict],
    model: str,
    stream: bool = False,
    provider: str = "openai",
) -> str | Generator[str, None, None]:
    """Proxy LLM chat request through Supabase Edge Function.

    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model name (e.g., 'gpt-4o', 'gpt-5.1')
        stream: Whether to stream the response
        provider: LLM provider ('openai', 'google')

    Returns:
        Complete response string, or generator of chunks if streaming
    """
    url = f"{get_proxy_url()}/llm-chat"
    payload = {
        "messages": messages,
        "model": model,
        "stream": stream,
        "provider": provider,
    }

    if stream:
        return _stream_llm_response(url, payload)
    else:
        with httpx.Client(timeout=120.0) as client:
            response = client.post(url, json=payload, headers=_get_headers())
            if response.status_code != 200:
                raise ProxyError(f"Proxy error: {response.text}")
            data = response.json()
            return data.get("content", "")


def _stream_llm_response(url: str, payload: dict) -> Generator[str, None, None]:
    """Stream LLM response chunks."""
    with httpx.Client(timeout=120.0) as client:
        with client.stream("POST", url, json=payload, headers=_get_headers()) as response:
            if response.status_code != 200:
                raise ProxyError(f"Proxy error: {response.status_code}")
            for line in response.iter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        content = data.get("content", "")
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue


def proxy_embeddings(
    texts: List[str],
    model: str,
    provider: str = "openai",
    input_type: str = "document",
) -> List[List[float]]:
    """Proxy embeddings request through Supabase Edge Function.

    Args:
        texts: List of texts to embed
        model: Embedding model name
        provider: Embedding provider ('openai', 'cohere', 'voyage')
        input_type: Type of input ('document' or 'query')

    Returns:
        List of embedding vectors
    """
    url = f"{get_proxy_url()}/embeddings"
    payload = {
        "texts": texts,
        "model": model,
        "provider": provider,
        "input_type": input_type,
    }

    with httpx.Client(timeout=300.0) as client:
        response = client.post(url, json=payload, headers=_get_headers())
        if response.status_code != 200:
            raise ProxyError(f"Proxy error: {response.text}")
        data = response.json()
        return data.get("embeddings", [])


def proxy_rerank(
    query: str,
    documents: List[str],
    model: str = "rerank-v4.0-fast",
    top_n: int = 10,
) -> List[dict]:
    """Proxy rerank request through Supabase Edge Function.

    Args:
        query: Query string to rerank against
        documents: List of document texts to rerank
        model: Reranking model name
        top_n: Number of top results to return

    Returns:
        List of dicts with 'index' and 'relevance_score'
    """
    url = f"{get_proxy_url()}/rerank"
    payload = {
        "query": query,
        "documents": documents,
        "model": model,
        "top_n": top_n,
    }

    with httpx.Client(timeout=60.0) as client:
        response = client.post(url, json=payload, headers=_get_headers())
        if response.status_code != 200:
            raise ProxyError(f"Proxy error: {response.text}")
        data = response.json()
        return data.get("results", [])
