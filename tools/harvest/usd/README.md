# tools/harvest/usd

Reads the OpenUSD `schema.usda` files and writes `catalogue/usd/*.yaml` (issue #42).

```
git clone --filter=blob:none --sparse https://github.com/PixarAnimationStudios/OpenUSD.git /path/to/usd-src
git -C /path/to/usd-src sparse-checkout set pxr/usd cmake/defaults
git -C /path/to/usd-src checkout bc32a655a41770f8ded78ef43789b044be1ba5ea
bun install
bun run harvest --src /path/to/usd-src --out ../../../catalogue/usd   # refuses any other commit
bun run check ../../../catalogue/usd                                   # counts + validation
bun test
```

Only text is parsed; nothing from the downloaded tree is executed. The pinned commit and licence live in `src/sources.ts`.
