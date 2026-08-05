"""The troubleshooting agent: grounds Claude's answers in retrieved manual excerpts."""

from typing import List, Optional

from .retriever import ManualRetriever

DEFAULT_MODEL = "claude-sonnet-5"

SYSTEM_PROMPT = """You are an expert field-service troubleshooter helping a technician \
diagnose an equipment fault. You are given excerpts retrieved from the \
equipment's official maintenance manuals as CONTEXT, plus the technician's \
message.

Rules:
- Base your diagnosis only on the CONTEXT and what the technician has told \
you. Do not invent specifications, part numbers, thresholds, or procedures \
that are not present in the CONTEXT.
- If the CONTEXT is insufficient or ambiguous (e.g. the equipment model is \
unknown, multiple manuals could apply, or no matching error code was \
found), say so plainly and ask one specific clarifying question instead of \
guessing.
- Always surface any relevant safety warnings from the CONTEXT before \
giving procedural steps that could be hazardous (electrical, pressure, \
rotating equipment, hot surfaces).
- Cite the source of every claim using the bracketed tag included in the \
context, e.g. [XR-4000 Industrial Air Compressor | 5.1 Compressor Fails to \
Start (E45)].
- When the CONTEXT indicates a step requires a certified technician or \
electrician, say so explicitly rather than describing the internal repair.

Structure every answer as:
1. Likely cause(s) - ranked most to least probable
2. Diagnostic steps - in the order the technician should perform them
3. Safety notes - only if relevant, otherwise omit this section
4. Escalate if - when to stop and call a certified technician, otherwise omit
"""


class TroubleshooterAgent:
    def __init__(self, retriever: ManualRetriever, client=None, model: str = DEFAULT_MODEL):
        self.retriever = retriever
        self.model = model
        self._client = client

    def _get_client(self):
        if self._client is None:
            import anthropic

            self._client = anthropic.Anthropic()
        return self._client

    @staticmethod
    def _build_context(chunks: List[dict]) -> str:
        return "\n\n---\n\n".join(c["text"] for c in chunks)

    @staticmethod
    def _sources(chunks: List[dict]) -> List[str]:
        seen, sources = set(), []
        for c in chunks:
            label = f'{c["metadata"].get("title")} | {c["metadata"].get("section_path")}'
            if label not in seen:
                seen.add(label)
                sources.append(label)
        return sources

    def diagnose(
        self,
        query: str,
        equipment_model: Optional[str] = None,
        history: Optional[List[dict]] = None,
        k: int = 6,
        max_tokens: int = 1200,
    ) -> dict:
        chunks = self.retriever.retrieve(query, k=k, model=equipment_model)

        if not chunks:
            return {
                "answer": (
                    "I couldn't find anything relevant in the ingested manuals for that "
                    "query. Could you confirm the equipment model and, if you have one, "
                    "the error code or symptom?"
                ),
                "sources": [],
                "chunks": [],
            }

        context = self._build_context(chunks)
        messages = list(history or [])
        messages.append({"role": "user", "content": f"CONTEXT:\n{context}\n\nTECHNICIAN: {query}"})

        client = self._get_client()
        response = client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=SYSTEM_PROMPT,
            messages=messages,
        )
        answer = "".join(block.text for block in response.content if block.type == "text")

        return {"answer": answer, "sources": self._sources(chunks), "chunks": chunks}
