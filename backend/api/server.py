from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from backend.api.routes.chat import router as chat_router
from backend.api.routes.index import router as index_router
from backend.api.routes.status import router as status_router
from backend.api.routes.settings import router as settings_router
from backend.providers.config import set_clerk_token


class ClerkTokenMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        clerk_token = request.headers.get("x-clerk-auth-token")
        if clerk_token:
            set_clerk_token(clerk_token)
        response = await call_next(request)
        return response


app = FastAPI(
    title="Docora API",
    description="Local file search with RAG",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ClerkTokenMiddleware)

app.include_router(chat_router, prefix="/api")
app.include_router(index_router, prefix="/api")
app.include_router(status_router, prefix="/api")
app.include_router(settings_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "Docora API", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
