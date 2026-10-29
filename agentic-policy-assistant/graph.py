"""
graph.py  -  Task 2.2 (Graph orchestration).

    plan -> memory_read -> agent_answer -> critic -> memory_write -> stop
                               ^             |
                               +-- retry ----+   (once, if critic fails)

Router rules (route_after_*):
  * budget:  every node increments state["steps"]; when steps >= max_steps the
             router sends the run straight to `stop` (stop_reason="budget_exhausted")
  * critic:  valid -> memory_write ; invalid and retries < max_retries -> agent_answer
             (with the critic's issues as feedback) ; otherwise -> stop ("critic_failed")

Observability: each node appends {node, step, latency_ms} to state["trace"] and logs it.
Checkpointing: in-memory (MemorySaver) by default, SQLite with use_sqlite=True.

Run on its own:
    python graph.py
"""
from __future__ import annotations

import logging
import sqlite3
import time
import uuid
from typing import Callable, Optional

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from agent import EXPLICIT_ID_RE, MATH_RE, build_agent
from critic import critique
from memory import SemanticMemory
from models import GraphState, Settings, get_settings
from prompts import RETRY_FEEDBACK_TEMPLATE

log = logging.getLogger("policy_assistant.graph")


def _node(name: str, fn: Callable[[GraphState], dict]) -> Callable[[GraphState], dict]:
    """Wrap a node: count the step, time it, log it, and catch errors (typed stop)."""
    def wrapped(state: GraphState) -> dict:
        t0 = time.perf_counter()
        step = state.get("steps", 0) + 1
        try:
            update = fn(state)
        except Exception as e:  # node failure -> stop softly instead of crashing the graph
            log.exception("node %s failed", name)
            update = {"stop_reason": f"error_in_{name}: {type(e).__name__}: {e}"}
        ms = round((time.perf_counter() - t0) * 1000, 2)
        log.info("node=%s step=%d latency_ms=%.2f", name, step, ms)
        return {**update, "steps": step,
                "trace": state.get("trace", []) + [{"node": name, "step": step, "latency_ms": ms}]}
    return wrapped


def build_graph(settings: Optional[Settings] = None, memory: Optional[SemanticMemory] = None,
                verbose: bool = False, use_sqlite: bool = False, agent=None):
    s = settings or get_settings()
    mem = memory if memory is not None else SemanticMemory(s)
    agent = agent or build_agent(s, verbose=verbose)   # any object with .invoke(q) -> AgentResult

    # ------------------------------- nodes ------------------------------- #
    def plan(state: GraphState) -> dict:
        q = state["question"]
        steps = ["check memory for a verified fact"]
        if MATH_RE.search(q):
            steps.append("compute arithmetic with calculator")
        if EXPLICIT_ID_RE.search(q):
            steps.append("read the named policy; if missing, recover via policy_search")
        else:
            steps.append("policy_search -> read_policy on the top hit")
        steps += ["answer with [doc_id] + verbatim quote", "critic check", "write verified fact"]
        return {"plan": steps, "retries": state.get("retries", 0),
                "max_steps": state.get("max_steps", s.max_steps)}

    def memory_read(state: GraphState) -> dict:
        hit = mem.read(state["question"])
        if not hit:
            return {"memory_hit": False, "memory_hint": None}
        return {"memory_hit": True, "memory_hint": SemanticMemory.to_hint(hit)}

    def agent_answer(state: GraphState) -> dict:
        q = state["question"]
        if state.get("memory_hint"):
            q += "\n\n" + state["memory_hint"]
        issues = state.get("critic", {}).get("issues")
        if issues:  # this is the retry pass
            q += "\n\n" + RETRY_FEEDBACK_TEMPLATE.format(issues="; ".join(issues))
        res = agent.invoke(q)
        return {"answer": res.answer, "agent_iterations": res.iterations,
                "tool_calls": [t.model_dump() for t in res.tool_calls]}

    def critic(state: GraphState) -> dict:
        return {"critic": critique(state["question"], state.get("answer", ""),
                                   state.get("tool_calls", []), s)}

    def memory_write(state: GraphState) -> dict:
        ok, reason = mem.write(state["question"], state["answer"],
                               critic_valid=state.get("critic", {}).get("valid", False))
        log.info("memory_write: %s", reason)
        return {"memory_written": ok}

    def stop(state: GraphState) -> dict:
        return {"stop_reason": state.get("stop_reason") or "completed"}

    # ------------------------------ routers ------------------------------ #
    def over_budget(state: GraphState) -> bool:
        return state.get("steps", 0) >= state.get("max_steps", s.max_steps)

    def route_linear(next_node: str):
        def router(state: GraphState) -> str:
            if state.get("stop_reason"):
                return "stop"
            return "stop" if over_budget(state) else next_node
        return router

    def route_after_critic(state: GraphState) -> str:
        if state.get("stop_reason") or over_budget(state):
            return "stop"
        if state.get("critic", {}).get("valid"):
            return "memory_write"
        if state.get("retries", 0) < s.max_retries:
            return "retry"
        return "critic_failed"

    def mark_retry(state: GraphState) -> dict:
        return {"retries": state.get("retries", 0) + 1}

    def mark_critic_failed(state: GraphState) -> dict:
        return {"stop_reason": "critic_failed"}

    def mark_budget(state: GraphState) -> dict:
        return {"stop_reason": state.get("stop_reason") or "budget_exhausted"}

    # ------------------------------- wiring ------------------------------ #
    g = StateGraph(GraphState)
    for name, fn in [("plan", plan), ("memory_read", memory_read), ("agent_answer", agent_answer),
                     ("critic", critic), ("memory_write", memory_write)]:
        g.add_node(name, _node(name, fn))
    g.add_node("retry", mark_retry)                    # bookkeeping, not counted as a step
    g.add_node("critic_failed", mark_critic_failed)
    g.add_node("budget_stop", mark_budget)
    g.add_node("stop", stop)

    g.add_edge(START, "plan")
    g.add_conditional_edges("plan", route_linear("memory_read"),
                            {"memory_read": "memory_read", "stop": "budget_stop"})
    g.add_conditional_edges("memory_read", route_linear("agent_answer"),
                            {"agent_answer": "agent_answer", "stop": "budget_stop"})
    g.add_conditional_edges("agent_answer", route_linear("critic"),
                            {"critic": "critic", "stop": "budget_stop"})
    g.add_conditional_edges("critic", route_after_critic,
                            {"memory_write": "memory_write", "retry": "retry",
                             "critic_failed": "critic_failed", "stop": "budget_stop"})
    g.add_edge("retry", "agent_answer")
    g.add_edge("critic_failed", "stop")
    g.add_edge("memory_write", "stop")
    g.add_edge("budget_stop", "stop")
    g.add_edge("stop", END)

    if use_sqlite:
        from langgraph.checkpoint.sqlite import SqliteSaver
        s.log_dir.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(s.log_dir / "checkpoints.sqlite"), check_same_thread=False)
        checkpointer = SqliteSaver(conn)
    else:
        checkpointer = MemorySaver()
    return g.compile(checkpointer=checkpointer)


def run_graph(app, question: str, max_steps: Optional[int] = None,
              thread_id: Optional[str] = None) -> GraphState:
    s = get_settings()
    t0 = time.perf_counter()
    state = app.invoke(
        {"question": question, "steps": 0, "retries": 0, "trace": [],
         "max_steps": max_steps or s.max_steps},
        config={"configurable": {"thread_id": thread_id or str(uuid.uuid4())},
                "recursion_limit": (max_steps or s.max_steps) * 3 + 10},
    )
    state["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    return state


def print_run(state: GraphState) -> None:
    print(f"Q: {state['question']}")
    print(f"plan: {state.get('plan')}")
    print(f"memory_hit={state.get('memory_hit')}  retries={state.get('retries')}  "
          f"steps={state.get('steps')}/{state.get('max_steps')}  "
          f"agent_iterations={state.get('agent_iterations')}  tool_calls={len(state.get('tool_calls', []))}")
    print(f"critic={state.get('critic')}  memory_written={state.get('memory_written', False)}  "
          f"stop_reason={state.get('stop_reason')}  latency_ms={state.get('latency_ms')}")
    print("nodes:", " -> ".join(t["node"] for t in state.get("trace", [])))
    print(state.get("answer", ""))


if __name__ == "__main__":
    import tempfile
    from pathlib import Path
    s = get_settings(memory_dir=Path(tempfile.mkdtemp()))   # fresh memory for the demo
    mem = SemanticMemory(s)
    app = build_graph(s, memory=mem)
    print(app.get_graph().draw_mermaid())   # paste into mermaid.live to see the diagram
    q = "What is our remote work limit? Cite and quote."
    print("\n===== COLD run (empty memory) =====")
    print_run(run_graph(app, q))
    print("\n===== WARM run (memory hit) =====")
    print_run(run_graph(app, q))
    print("\n===== BUDGET stop (max_steps=3) =====")
    print_run(run_graph(app, "Is MFA required for VPN?", max_steps=3))
