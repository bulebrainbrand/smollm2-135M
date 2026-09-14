import json
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer
 
REPO = "HuggingFaceTB/SmolLM2-135M-Instruct"
 
# tokenizer.json をローカルにダウンロード(キャッシュされる)
tokenizer_path = hf_hub_download(repo_id=REPO, filename="tokenizer.json")
tok = Tokenizer.from_file(tokenizer_path)
 
test_cases = [
    "Hello, world!",
    "TypeScriptで実装したい",
    "  multiple   spaces  and\ttabs\n",
    "The quick brown fox jumps over the lazy dog.",
    "1234567890 + 3.14159",
    "```python\nprint('hello')\n```",
    "😀🚀 emoji test 🎉",
    "",
    " leading space",
    "trailing space ",
    "<|im_start|>user\nこんにちは、調子はどう?<|im_end|>\n",
    "don't can't won't I'm you're",
    "URLはhttps://example.com/path?query=1です",
    "改行を含む\n複数行の\nテキスト",
    "Mixed 日本語 and English in ONE sentence 123",
]
 
results = []
for text in test_cases:
    encoding = tok.encode(text)
    results.append({
        "text": text,
        "ids": encoding.ids,
        "tokens": encoding.tokens,
    })
 
with open("reference.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)