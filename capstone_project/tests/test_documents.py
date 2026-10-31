import documents


def test_product_docs(clean_df):
    docs = documents.build_product_docs(clean_df)
    ids = [d["doc_id"] for d in docs]
    assert len(ids) == len(set(ids)) == 1497
    d = docs[0]
    for word in ("Price: Rs.", "Category:", "Brand:", "Customer review:"):
        assert word in d["text"]


def test_policy_docs():
    import data_prep
    pol = data_prep.load_policies()
    chunks = documents.build_policy_docs(pol)
    assert {c["doc_id"] for c in chunks} == set(pol)
    assert all(c["sentence"] in pol[c["doc_id"]] for c in chunks)
    assert len({c["chunk_id"] for c in chunks}) == len(chunks)
