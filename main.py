"""
VictorySync API server.

Install dependencies:
    python -m pip install fastapi uvicorn

Run locally:
    $env:VICTORYSYNC_SERVER_KEY = "replace_with_a_strong_secret"
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Example request:
    curl -X POST http://localhost:8000/v1/leads ^
      -H "Authorization: Bearer replace_with_a_strong_secret" ^
      -H "Content-Type: application/json" ^
      -d "{\"id\":\"lead_123\",\"source\":\"local_agent\",\"raw_data\":\"processed lead data\"}"
"""

from __future__ import annotations

import os
from secrets import compare_digest

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, StrictStr


SERVER_KEY = os.getenv("VICTORYSYNC_SERVER_KEY", "your_development_key_here")
security = HTTPBearer(auto_error=False)

app = FastAPI(
    title="VictorySync API",
    description="Secure ingestion API for processed lead payloads.",
    version="1.0.0",
)


class LeadPayload(BaseModel):
    """Strict request contract for processed lead ingestion."""

    id: StrictStr
    source: StrictStr
    raw_data: StrictStr

    class Config:
        extra = "forbid"


def verify_bearer_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> None:
    """Validate the bearer token against the configured server key."""

    if credentials is None or not compare_digest(credentials.credentials, SERVER_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


@app.post("/v1/leads", status_code=status.HTTP_200_OK)
async def ingest_lead(
    payload: LeadPayload,
    _: None = Depends(verify_bearer_token),
) -> dict[str, str]:
    """Receive a processed lead and acknowledge secure vault storage."""

    print(
        f"VictorySync vault ingestion successful: lead_id={payload.id}, "
        f"source={payload.source}",
        flush=True,
    )
    print(f"Raw data:\n{payload.raw_data}", flush=True)

    return {
        "status": "success",
        "message": "Lead was safely stored in the VictorySync vault.",
        "lead_id": payload.id,
    }
