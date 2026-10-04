"""The agent loop: let the model call read-only tools until it has an answer."""

import json
import logging
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from .providers import Provider
from .tools import TOOL_SPECS, TOOLS

logger = logging.getLogger("fleetflow.assistant")
MAX_TOOL_ROUNDS = 5

SYSTEM_PROMPT = """You are FleetFlow's dispatch assistant, helping the dispatcher of a parcel delivery company.
Answer using the tools; never guess numbers, plates, statuses or tracking IDs. If a tool returns an error, say so plainly.
You can look things up and preview plans, but you cannot change anything: if asked to assign, refund, delete or apply
a plan, explain which button in the dashboard does it. Keep answers short and practical, use plain language, and
format money from cents (e.g. 1250 cents = 12.50 in the given currency). Times are ISO 8601; mention the time zone when relevant."""


@dataclass
class AgentReply:
    text: str
    tools_used: list[str] = field(default_factory=list)


def run_agent(provider: Provider, db: Session, history: list[tuple[str, str]]) -> AgentReply:
    messages = provider.start(SYSTEM_PROMPT, history)
    used: list[str] = []
    for _ in range(MAX_TOOL_ROUNDS):
        turn, raw = provider.complete(messages, TOOL_SPECS)
        messages.append(raw)
        if not turn.tool_calls:
            return AgentReply(text=turn.text or "I don't have an answer for that.", tools_used=used)

        results = []
        for call in turn.tool_calls:
            used.append(call.name)
            tool = TOOLS.get(call.name)
            try:
                result = tool(db, **call.args) if tool else {"error": f"Unknown tool {call.name}"}
            except TypeError:
                result = {"error": f"Invalid arguments for {call.name}: {json.dumps(call.args)}"}
            except Exception:
                # A failing lookup becomes something the model can explain, not a crashed request
                logger.exception("Assistant tool %s failed", call.name)
                db.rollback()
                result = {"error": f"{call.name} failed on the server"}
            results.append((call.name, result))
        messages.append(provider.tool_results(results))

    return AgentReply(text="That needed too many lookups. Try asking something more specific.", tools_used=used)
