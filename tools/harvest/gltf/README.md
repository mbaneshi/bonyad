# tools/harvest/gltf

Reads the Khronos glTF 2.0 JSON Schema files (core and `KHR_` extensions) and writes `catalogue/gltf/*.yaml` (issue #42).

```
git clone --filter=blob:none https://github.com/KhronosGroup/glTF.git /path/to/gltf-src
git -C /path/to/gltf-src checkout 7cee0fcddd5730e90d488bfb5aa2e52171483dde
bun install
bun run harvest --src /path/to/gltf-src --out ../../../catalogue/gltf   # refuses any other commit
bun run check ../../../catalogue/gltf                                   # counts + local validation
bun test
```

The authoritative validator is `tools/catalogue` (`bun run validate ../../catalogue`); `src/conform.ts` makes the raw
conversion satisfy its rules (no base on children, no nested children, no array defaults, name length).

Only text is parsed; nothing from the downloaded tree is executed. Pinned commit and licences live in `src/sources.ts`.
Khronos extension schemas are not CC-BY: their description text is withheld (`WITHHOLD_EXTENSION_TEXT`).
