# Research Memory: Metro Inlined Requires

This file tracks learnings as I scaffold and test the three Metro bundling
experiences (vanilla React Native, Expo, rnx-kit).

## Goal

Understand how inlined requires change the *final bundle output* across:
- Vanilla React Native (Metro `inlineRequires`)
- Expo (its own Metro defaults / transform)
- rnx-kit (inline requires + bundle splitting)

## Plan

1. Create a shared app source (`shared-app/`) with modules designed to make the
   inline-requires transform visible in the output bundle.
2. Scaffold three bundling setups that consume the shared source:
   - `vanilla-rn/`
   - `expo-app/`
   - `rnx-kit-app/`
3. Produce bundles with inlineRequires ON vs OFF and diff the output.
4. Record findings here and answer the README questions.

## Findings

### Vanilla React Native (Metro 0.84.4, RN 0.85.3)

Setup: `vanilla-rn/` resolves the shared app via `watchFolders` +
`resolver.nodeModulesPaths`. Two configs differing only in
`transformer.getTransformOptions -> transform.inlineRequires`.

Built with `react-native bundle --dev false` (production, single bundle).

**What inlineRequires actually does to the output:**

In our `App` module, `heavy` and `rarely-used` are imported at the *top* but
only referenced inside `onPress` handlers.

- `inlineRequires: false` (eager) — the module factory hoists ALL requires to
  the top and evaluates them on module load:
  ```js
  ...,o=_r(d[4]),u=_r(d[5]),i=_r(d[6])},2,[1,3,9,11,504,505,257]);
  //         ^heavy   ^rare  (evaluated at module init)
  // call site: (0,o.heavyCompute)(1e3)  // uses pre-required binding `o`
  ```
- `inlineRequires: true` (inline/lazy) — non-block-listed requires are MOVED
  INTO the call site; block-listed ones stay hoisted:
  ```js
  // top keeps: t,r (react), n (react-native), o (jsx-runtime) -> all block-listed
  ...,n=_r(d[3]),o=_r(d[4])},2,[1,3,9,11,243,502,503]);
  // call site now requires lazily:
  onPress:()=>{var e=(0,_r(d[5]).heavyCompute)(1e3); ... _r(d[5]).HEAVY_TAG ...}
  onPress:()=>{ ... _r(d[6]).formatRare('inlined requires') ... }
  ```

**CORRECTION (important):** my first read was "render-path bindings stay
hoisted." WRONG. The transform inlines EVERY matching `var x = require(...)`
reference to its use site. `react-native`/`react`/jsx stay hoisted for two
mechanical reasons, not because of render usage:
1. Default block list `nonInlinedRequires` (metro/src/lib/transformHelpers.js
   `baseIgnoredInlineRequires`): `React, react, react/jsx-runtime,
   react/jsx-dev-runtime, react-compiler-runtime, react-native`.
2. Requires wrapped in interop helpers (`_interopRequireDefault(require(...))`)
   aren't a bare `require()` call, so the plugin skips them (covers React + the
   babel runtime helpers).
PROOF: setting `nonInlinedRequires: []` inlines react-native straight into the
JSX (`(0,_r(d[8]).jsxs)(_r(d[9]).View,...)`), no top-level vars left.
Also: inline requires is NOT memoized by default
(`unstable_memoizeInlineRequires: false`), so a module used twice in a handler
emits `require()` twice (cheap — cached registry lookup).

**INTEROP / LOWERING nuance (big one for "why don't I see a benefit?"):**
The inline-requires plugin only inlines: bare `require()`, or
`importDefault(require())` / `importAll(require())` (Metro's `_$$_IMPORT_DEFAULT`
/ `_$$_IMPORT_ALL`, configured via `inlineableCalls:[importDefault,importAll]`).
Babel's `_interopRequireDefault` / `_interopRequireWildcard` are NOT matched.
Which one you get depends on WHO lowers ESM:
- Babel lowering (stock `@react-native/babel-preset`): default imports ->
  `_interopRequireDefault(require())`, namespace -> `_interopRequireWildcard`;
  both stay EAGER even with inlineRequires:true. Only named imports / raw
  require() inline. (Verified with fixtures/entry.js.)
- Metro lowering (`disableImportExportTransform:true` + `experimentalImportSupport:true`):
  default/namespace use `_$$_IMPORT_DEFAULT`/`_$$_IMPORT_ALL` -> inlineable ->
  everything inlines (run() had zero top-level require vars). Expo uses this
  lowering by default (factory sig has `_$$_IMPORT_DEFAULT,_$$_IMPORT_ALL`).
- NOTE: setting `experimentalImportSupport:true` ALONE in getTransformOptions did
  nothing for stock vanilla — babel still lowered first. You MUST also set the
  preset's `disableImportExportTransform:true`. Full annex in ANSWERS.md.
Repro: vanilla-rn/fixtures/* + metro.config.{classic,importsupport}.js.

**Key takeaways:**
- The transform = "move `require()` to first use" (minus the block list and minus
  Babel-interop-wrapped default/namespace imports), deferring *evaluation*, not
  *inclusion*.
- Bundle SIZE is essentially unchanged (eager 992,261 B vs inline 993,386 B —
  inline is even slightly larger). Module COUNT unchanged (506 vs 504).
- The heavy module is STILL in the bundle (`HEAVY_MODULE_LOADED` present).
  => inlineRequires is NOT dead-code elimination and NOT bundle splitting. It
     only changes WHEN a module's top-level code runs (TTI / startup win),
     not whether it ships.

### Expo (SDK 56, expo 56.0.9, RN 0.85.3, metro 0.84.4)

Setup: `expo-app/` consumes the shared source via a symlink (`expo-app/shared
-> ../shared-app/src`). Built with `npx expo export --platform ios`.

NOTE: Expo's resolver rejected a relative import that escapes the project root
(`../shared-app/...`) even with `watchFolders` set — had to use a symlink
inside the project so the realpath lands inside a watched folder. Vanilla RN's
resolver accepted the escaping relative path directly. (Resolver strictness
difference worth a mention.)

**Output format difference (big one):**
- `expo export` defaults to **Hermes bytecode** → `_expo/static/js/ios/index-*.hbc`
  (1.6 MB). You get precompiled bytecode, not JS, in the shipped app.
- `--no-bytecode` yields a plain JS bundle (2.4 MB unminified) for inspection.
- Vanilla `react-native bundle` (as I ran it) produced plain JS `.bundle`;
  Hermes compilation is a separate step there.

**Does Expo inline requires by default? NO.**
`@expo/metro-config` (ExpoMetroConfig.js) default `getTransformOptions`:
```js
transform: { experimentalImportSupport: true, inlineRequires: false }
```
So by default Expo uses Metro's import/export support but keeps requires EAGER:
```js
// Expo default App module (top, eager):
var _react = require(_dependencyMap[0]);
var _reactNative = require(_dependencyMap[1]);
var _heavy = require(_dependencyMap[2]);        // eager!
var _rarelyUsed = require(_dependencyMap[3]);    // eager!
// call site: (0, _heavy.heavyCompute)(1000)
```
This differs from the long-standing assumption that "Expo enables inlineRequires
by default" — in SDK 56 the default is `experimentalImportSupport: true` +
`inlineRequires: false`.

Forcing it back on (`EXPO_INLINE=on` → `inlineRequires: true`) reproduces the
deferred behavior, and it composes with experimentalImportSupport:
```js
var _react = require(...); var _reactNative = require(...);   // block-listed, eager
runHeavy = () => { var result = (0, require(_dependencyMap[3]).heavyCompute)(1000); ... }
runRare  = () => { setOutput((0, require(_dependencyMap[4]).formatRare)('...')); }
```

Expo ALSO ships an experimental tree-shaking / "reconcile" serializer
(`treeShakeSerializerPlugin` / `reconcileTransformSerializerPlugin`, gated by
`EXPO_UNSTABLE_TREE_SHAKING`) that can re-run the transform with
`inlineRequires`/`nonInlinedRequires` — this is the path that can actually
remove code, unlike plain inlineRequires. Off by default.

### rnx-kit (@rnx-kit/cli 2.0.1, metro-config 2.2.4, esbuild-serializer 0.4.1)

Setup: `rnx-kit-app/` uses `@rnx-kit/metro-config` `makeMetroConfig` (Metro
defaults + robust symlink/duplicate handling) and bundles via `rnx-cli bundle`.
Shared source via symlink again. Needed `shared-app/package.json` so rnx-kit's
TS plugin can find a "project root" for the shared files.

**Plain rnx-kit bundle** = standard Metro `__d(...)` registry, eager requires
(`var _heavy = _$$_REQUIRE(_dependencyMap[4])`). Same shape as vanilla. 506
modules, 992 KB minified.

**Tree shaking (`--tree-shake`)** swaps Metro's serializer for the **esbuild**
serializer (`@rnx-kit/metro-serializer-esbuild`). Output is a totally different
format: an esbuild IIFE bundle with `__commonJS` wrappers (and readable
`// node_modules/...` path comments when unminified) — NOT Metro's `__d`
registry.

GOTCHA that cost real DCE: esbuild can only tree-shake ESM. Babel's
`@react-native/babel-preset` rewrites `import/export` to CommonJS by default,
which esbuild treats as opaque. Fix = `disableImportExportTransform: true` in
babel preset for production tree-shake builds. rnx-cli's `--tree-shake` adds the
esbuild serializer + `esbuildTransformerConfig`, but does NOT flip the babel
option for you, so I gate it on `RNX_METRO_SERIALIZER_ESBUILD` env and set that
env when bundling (also `--reset-cache` to avoid stale transform cache).

Result with ESM preserved:
- `deadExport` (unused) -> REMOVED from bundle (marker count 0).
- Minified size 992 KB (plain) -> **807 KB (tree-shaken), ~19% smaller** — and
  that's mostly unused code pruned across the whole graph (incl. react-native),
  not just our one function.

So rnx-kit's headline win over vanilla/Expo defaults = real **dead-code
elimination / tree shaking**, which plain Metro (inlineRequires) does not do.
`--metafile` emits an esbuild metafile for bundle analysis.

### Dynamic import() / bundle splitting (Q4, Q5)

Added `lazy.js` loaded via `await import('./lazy')`.

Metro compiles `import('./lazy')` to an **async require** within the SAME bundle:
```js
var e = (yield _r(d[9])(d[8], d.paths)).lazyGreeting;
//            ^asyncRequire ^moduleId
```
- The lazy module is STILL in the single output bundle (`LAZY_CHUNK_EVALUATED`
  present). No separate chunk file is emitted — both vanilla `react-native
  bundle` and `expo export` produce exactly ONE js/hbc file in React Native.
- So `import()` in React Native = runtime *deferral of evaluation* (module factory
  runs on first await), NOT a separate downloadable chunk. Same shipping cost,
  better startup.
- Web-style code splitting (multiple chunks) is a Metro/Expo *web* feature; for
  React Native production the norm is a single bundle compiled to Hermes bytecode.

**Hermes angle:** Hermes precompiles the whole bundle to bytecode and lazily
compiles function bodies on first call. That already gives much of what
inline-requires/RAM-bundles aimed for (avoid parsing everything eagerly). RAM
bundles are effectively obsolete with Hermes. The remaining win from
inlineRequires/`import()` under Hermes is deferring module top-level
*evaluation* (side effects, building objects), not parse cost.

### Summary table (minified, ios, this shared app)

| Setup                         | What it does to requires        | DCE? | Output         | Size    |
|-------------------------------|---------------------------------|------|----------------|---------|
| Vanilla, inlineRequires:false | eager top-of-module             | no   | Metro __d JS   | 992 KB  |
| Vanilla, inlineRequires:true  | move require() to first use      | no   | Metro __d JS   | ~992 KB |
| Expo default                  | eager (experimentalImportSupport)| no  | Hermes .hbc    | 1.6 MB* |
| rnx-kit --tree-shake (esbuild)| (esbuild scope hoisting)        | YES  | esbuild IIFE   | 807 KB  |

*Expo's plain JS (minified) was ~1 MB; .hbc is bytecode so not size-comparable.
Inline requires barely moves SIZE — it's a startup/TTI lever. Tree shaking is
the only one of these that meaningfully shrinks the bundle.

