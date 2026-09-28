# Spec files

`SPEC.md` is the canonical English spec for this OSS project. `SPEC.ja.md` is its Japanese counterpart. When either file changes, update the other in the same change so both describe the same behavior.

# Development flow

Before writing or changing tests that trigger navigation on YouTube, read `YT-SPEC.md` for how YouTube's SPA navigation works and what has been observed in practice.

1. Check that the test cases in `SPEC.md` and `SPEC.ja.md` mean the same, then align the test implementation with those cases. Do not weaken a case just to make a test pass.
2. Run the tests, then converge the implementation until they pass. A case is converged only when a test covers it.
