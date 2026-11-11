#!/usr/bin/env python3
"""Split the Web Worker out of vosk-browser's vosk.js.

vosk.js embeds its worker as one 5.8 MB base64 string and starts it from a
generated blob: URL, which extension pages may not do. The Firefox build ships:

  vosk-worker.js  the embedded worker, decoded exactly as vosk.js's own
                  createURL() does it (atob, drop the first line, which is a
                  bundler comment), saved as a regular file;
  vosk.js         the original file with only that base64 string emptied. The
                  rest is unchanged. The string is never used, because the
                  engine page (engine.js) starts vosk-worker.js instead, and
                  without it vosk.js stays under the 5 MB limit of Mozilla's
                  add-on validator.

Usage: extract_worker.py <vosk.js from npm> <out vosk-worker.js> <out vosk.js>
"""
import base64
import re
import sys

PATTERN = re.compile(r"(createBase64WorkerFactory\(')([A-Za-z0-9+/=]+)(',\s*null,\s*false\))")


def main(src, worker_out, slim_out):
    # newline="" keeps the original line endings (vosk.js mixes CRLF and LF).
    text = open(src, encoding="utf-8", newline="").read()
    matches = PATTERN.findall(text)
    if len(matches) != 1:
        sys.exit("expected exactly one embedded worker: is this vosk-browser 0.0.8?")
    # atob() yields one character per byte; the Blob then stores those characters as UTF-8.
    source = base64.b64decode(matches[0][1]).decode("latin-1")
    body = source[source.index("\n", 10) + 1:]
    with open(worker_out, "w", encoding="utf-8", newline="") as out:
        out.write(body)
    with open(slim_out, "w", encoding="utf-8", newline="") as out:
        out.write(PATTERN.sub(r"\1\3", text))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
