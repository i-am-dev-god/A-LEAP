.PHONY: test demo frames clean doctor

test:
	python3 tests/test_engine.py

demo:
	python3 -m leap demo --tts none

frames:
	python3 -m leap frames examples/demo.json --per-shot 1

doctor:
	python3 -m leap doctor

clean:
	rm -rf out .scratch
