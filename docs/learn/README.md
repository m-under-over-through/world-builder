# Learning notes

Explainers for the ideas in this codebase, written for the operator: someone who understands systems at a high level and wants to see the actual procedure and the actual code. Each note has the same shape: the idea, why it is here, the procedure in this repository, how to check it yourself, what can go wrong, and what it does not do.

| Note                             | Idea                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `01-sealed-boxes.md`             | Public-key encryption, sealed boxes, and the key procedure                                                                             |
| `02-codes-hashes-and-peppers.md` | Why the code is hashed, why salting cannot work for lookup, what a pepper is, the numbers                                              |
| `03-schemas-as-contracts.md`     | Zod schemas as the shared vocabulary, validation at boundaries, reading a failure                                                      |
| `04-repo-anatomy-and-tooling.md` | Workspaces, the config files, how tests run, how to read a failing run                                                                 |
| `05-what-a-review-finds.md`      | Ten lessons from the first independent review: atomic file creation, bounded contracts, text encoding, degenerate keys, strict schemas |
| `06-the-skeleton-end-to-end.md`  | Where an answer goes, file by file; how to run the whole stack locally; what the skeleton taught                                       |
| `07-bundling-the-function.md`    | Imports, links and why a deployed function must be one file; how the build makes it and how two tests hold it                          |
