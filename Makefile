PYTHON ?= python3
.PHONY: loadtest-init loadtest-up loadtest-smoke loadtest-spike verify reset
loadtest-init:
	$(PYTHON) infrastructure/scripts/loadtest.py init
loadtest-up:
	$(PYTHON) infrastructure/scripts/loadtest.py up
loadtest-smoke:
	$(PYTHON) infrastructure/scripts/loadtest.py run --scenario A --users 1200
loadtest-spike:
	$(PYTHON) infrastructure/scripts/loadtest.py run --scenario C --jfr
verify:
	$(PYTHON) infrastructure/scripts/loadtest.py verify
reset:
	$(PYTHON) infrastructure/scripts/loadtest.py reset
