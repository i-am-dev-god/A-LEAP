#!/usr/bin/env python3
"""Entry point: python main.py examples/post.json -o out/short.mp4"""

import sys

from rsm.cli import main

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
