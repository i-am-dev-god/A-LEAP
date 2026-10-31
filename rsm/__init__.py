"""Reddit-story short generator.

Pipeline, one command:

    post  ->  narration  ->  word timings  ->  captions  ->  frames  ->  mp4

Nothing here is clever; it is the same assembly line every Reddit-story
channel runs, written so a single `make` call produces a 1080x1920 short.
"""

__version__ = "1.0.0"
