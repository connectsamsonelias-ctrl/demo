"""Command-line interface: ingest manuals, then ask one-off or interactive
troubleshooting questions."""

import argparse
import sys

from .ingest import DEFAULT_MANUALS_DIR, DEFAULT_STORE_DIR, ingest_manuals
from .retriever import ManualRetriever
from .troubleshooter import DEFAULT_MODEL, TroubleshooterAgent


def cmd_ingest(args):
    result = ingest_manuals(manuals_dir=args.manuals_dir, store_dir=args.store_dir, max_chars=args.max_chars)
    print(f"Processed {result['files_processed']} manual(s) from '{args.manuals_dir}'.")
    print(f"Indexed {result['n_chunks']} chunks -> {result['store_dir']}/chunks.jsonl")
    if result["n_embedded"] == 0:
        print(
            "Note: vector index not built (chromadb unavailable or offline). "
            "Falling back to keyword (BM25) search only."
        )
    else:
        print(f"Embedded {result['n_embedded']} chunks -> {result['store_dir']}/chroma")


def _print_result(result):
    print(f"\n{result['answer']}")
    if result["sources"]:
        print("\nSources:")
        for source in result["sources"]:
            print(f"  - {source}")


def cmd_ask(args):
    retriever = ManualRetriever(args.store_dir)
    agent = TroubleshooterAgent(retriever, model=args.model)
    result = agent.diagnose(args.query, equipment_model=args.equipment_model, k=args.k)
    _print_result(result)


def cmd_chat(args):
    retriever = ManualRetriever(args.store_dir)
    agent = TroubleshooterAgent(retriever, model=args.model)
    history = []

    print("RAG Maintenance Troubleshooter -- type 'exit' to quit.")
    if args.equipment_model:
        print(f"Equipment model filter: {args.equipment_model}")
    if not retriever.semantic_search_available:
        print("(semantic search unavailable, using keyword search only)")

    while True:
        try:
            query = input("\ntechnician> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not query:
            continue
        if query.lower() in ("exit", "quit"):
            break

        result = agent.diagnose(query, equipment_model=args.equipment_model, history=history, k=args.k)
        _print_result(result)

        history.append({"role": "user", "content": query})
        history.append({"role": "assistant", "content": result["answer"]})


def cmd_search(args):
    """Debug helper: show raw retrieved chunks without calling the LLM."""
    retriever = ManualRetriever(args.store_dir)
    chunks = retriever.retrieve(args.query, k=args.k, model=args.equipment_model)
    for i, chunk in enumerate(chunks, 1):
        meta = chunk["metadata"]
        print(f"\n[{i}] {meta['title']} | {meta['section_path']} ({meta['chunk_type']})")
        print(chunk["text"])


def build_parser():
    parser = argparse.ArgumentParser(prog="rag_troubleshooter", description="RAG maintenance manual troubleshooter")
    parser.add_argument("--store-dir", default=str(DEFAULT_STORE_DIR), help="Index storage directory")

    sub = parser.add_subparsers(dest="command", required=True)

    p_ingest = sub.add_parser("ingest", help="Parse manuals and (re)build the retrieval index")
    p_ingest.add_argument("--manuals-dir", default=str(DEFAULT_MANUALS_DIR))
    p_ingest.add_argument("--max-chars", type=int, default=900)
    p_ingest.set_defaults(func=cmd_ingest)

    p_ask = sub.add_parser("ask", help="Ask a single troubleshooting question")
    p_ask.add_argument("query")
    p_ask.add_argument("--equipment-model", default=None, help="Filter to a specific equipment model, e.g. XR-4000")
    p_ask.add_argument("--model", default=DEFAULT_MODEL, help="Claude model to use")
    p_ask.add_argument("-k", type=int, default=6, help="Number of chunks to retrieve")
    p_ask.set_defaults(func=cmd_ask)

    p_chat = sub.add_parser("chat", help="Interactive troubleshooting session")
    p_chat.add_argument("--equipment-model", default=None)
    p_chat.add_argument("--model", default=DEFAULT_MODEL)
    p_chat.add_argument("-k", type=int, default=6)
    p_chat.set_defaults(func=cmd_chat)

    p_search = sub.add_parser("search", help="Debug: show retrieved chunks without calling the LLM")
    p_search.add_argument("query")
    p_search.add_argument("--equipment-model", default=None)
    p_search.add_argument("-k", type=int, default=6)
    p_search.set_defaults(func=cmd_search)

    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
