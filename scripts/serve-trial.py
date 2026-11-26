import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class TrialHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        path = urlsplit(self.path).path
        if path == "/data/questions.json":
            self.send_header("Cache-Control", "private, no-store")
        super().end_headers()


parser = argparse.ArgumentParser(description="Serve the approved trial build.")
parser.add_argument("--port", type=int, default=3000)
parser.add_argument("--bind", default="127.0.0.1")
args = parser.parse_args()
directory = Path(__file__).resolve().parent.parent / "private-dist"
if not (directory / "data" / "questions.json").is_file():
    parser.error("Build private-dist first.")
handler = partial(TrialHandler, directory=str(directory))
with ThreadingHTTPServer((args.bind, args.port), handler) as server:
    print(f"Trial listening on {args.bind}:{args.port}", flush=True)
    server.serve_forever()
