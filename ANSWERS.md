# Metro Inlined Requires: Findings & Answers

This document answers the questions from `README.md`, backed by real bundles
produced from a single shared app (`shared-app/`) wired into three setups:

- `vanilla-rn/`   — React Native 0.85.3 + Metro 0.84.4 (`react-native bundle`)
- `expo-app/`     — Expo SDK 56 (`expo export`)
- `rnx-kit-app/`  — `@rnx-kit/cli` + esbuild serializer (`rnx-cli bundle`)

All three consume the *same* `shared-app/src/App.js`, which imports modules at
the top level but only uses them inside event handlers — the exact shape that
makes the inline-requires transform observable. See `MEMORY.md` for the raw
investigation log and `*/out` or `*/dist*` for the produced bundles.

> TL;DR: inline requires moves `require()` to the first use site to defer
> *evaluation*; it does **not** remove code or split the bundle. Expo's default
> in SDK 56 does **not** enable inline requires (it uses
> `experimentalImportSupport`). Only rnx-kit's esbuild tree-shaking actually
> shrinks the bundle. Native = one bundle; `import()` defers eval, it doesn't
> split chunks.

---

## 1. How do inlined requires work?

A Babel transform (`metro-transform-plugins` `inline-requires`) rewrites a
module so that `require()` calls are not executed at module-load time. Instead,
each `require()` is moved to (inlined at) the **first place the imported binding
is used**.

Before (eager):
```js
var _heavy = require(_dependencyMap[2]); // runs when this module loads
function onPress() { _heavy.heavyCompute(1000); }
```
After (inline / lazy):
```js
// no top-level require for heavy
function onPress() { require(_dependencyMap[2]).heavyCompute(1000); }
```

Consequences:
- The imported module's **top-level code runs lazily** — only when the code path
  that needs it first executes (improves startup / time-to-interactive).
- It is purely a *when-does-it-evaluate* change. The module is **still in the
  bundle**; nothing is removed, nothing is split out.
- Not every require is inlined. The transform skips a default block list
  (`nonInlinedRequires`: `React`, `react`, `react/jsx-runtime`,
  `react/jsx-dev-runtime`, `react-compiler-runtime`, `react-native`) and skips
  requires wrapped in interop helpers (`_interopRequireDefault(require(...))`).
  That — NOT any "is it on the render path" analysis — is why `react-native`
  stays hoisted while `heavy`/`rare` get inlined. (Verified: emptying the block
  list inlines `react-native` straight into the JSX too.)

## 2. With Metro `inlineRequires: true`, what does the bundle look like?

Measured in `vanilla-rn/` with two configs differing only in
`transformer.getTransformOptions().transform.inlineRequires`.

`inlineRequires: false` — the module factory hoists every require to the top and
the dependency map is fully evaluated on load:
```js
...,o=_r(d[4]),u=_r(d[5]),i=_r(d[6])},2,[1,3,9,11,504,505,257]);
//        ^heavy   ^rare evaluated at module init
onPress:()=>{ (0,o.heavyCompute)(1e3) }       // uses pre-required binding
```

`inlineRequires: true` — non-block-listed requires are pushed to their use site;
block-listed ones (react, react-native, jsx runtime) remain hoisted:
```js
...,n=_r(d[3]),o=_r(d[4])},2,[1,3,9,11,243,502,503]);   // react-native, jsx (block-listed)
onPress:()=>{ (0,_r(d[5]).heavyCompute)(1e3); _r(d[5]).HEAVY_TAG }
onPress:()=>{ _r(d[6]).formatRare('inlined requires') }
```

Bundle facts:
- Module count basically identical (506 vs 504).
- Size essentially identical (992,261 B eager vs 993,386 B inline — inline is
  even *slightly larger*).
- The "heavy" module is still present in both.

=> inline requires is a **startup-time optimization, not a size optimization**,
and not dead-code elimination.

## 3. How does Expo change Metro's `inlineRequires` behavior?

Two meaningful differences in Expo SDK 56:

1. **Output format.** `expo export` defaults to **Hermes bytecode** (`.hbc`),
   not JS. (`--no-bytecode` produces a JS bundle for inspection.) `react-native
   bundle` produces JS and Hermes compilation is a separate step.

2. **It does NOT enable inline requires by default.** `@expo/metro-config`'s
   default `getTransformOptions` returns:
   ```js
   transform: { experimentalImportSupport: true, inlineRequires: false }
   ```
   So Expo relies on Metro's import/export support and keeps requires **eager**:
   ```js
   var _heavy = require(_dependencyMap[2]);     // eager in Expo default
   var _rarelyUsed = require(_dependencyMap[3]); // eager in Expo default
   ```
   This contradicts the common belief that "Expo turns inline requires on by
   default." If you want deferral you must turn it on yourself
   (`transformer.getTransformOptions -> inlineRequires: true`), which composes
   fine with `experimentalImportSupport` (verified via `EXPO_INLINE=on`).

Expo additionally ships an experimental **tree-shaking / "reconcile" serializer**
(`treeShakeSerializerPlugin` + `reconcileTransformSerializerPlugin`, gated behind
`EXPO_UNSTABLE_TREE_SHAKING`) that can re-run the transform with
`inlineRequires`/`nonInlinedRequires` and actually drop code — off by default.

## 4. Does RN Metro support bundle splitting? Does Hermes benefit?

**React Native: no real bundle splitting.** A production React Native build emits a single
bundle (then, with Hermes, a single `.hbc`). We added `await import('./lazy')`
and confirmed:
- Metro compiles `import()` into an **async require of an already-bundled
  module**:
  ```js
  var e = (yield _r(d[9])(d[8], d.paths)).lazyGreeting; // asyncRequire(moduleId)
  ```
- The lazy module still ships inside the one bundle; **no separate chunk file**
  is emitted by either `react-native bundle` or `expo export`.

So `import()` in React Native = *deferred evaluation*, not *code splitting*. Web-style
multi-chunk splitting is a Metro/Expo **web** capability, not React Native.

**Hermes:** Hermes precompiles the whole bundle to bytecode and **lazily
compiles function bodies on first call**, so it already avoids eagerly parsing
everything at startup. That makes RAM bundles obsolete and reduces (but doesn't
eliminate) the value of inline requires — the remaining win under Hermes is
deferring module **top-level evaluation** (side effects / object construction),
not parse cost. Hermes does not benefit from splitting because there is no
separate-chunk loading in React Native.

## 5. When the intent is to defer JavaScript work, what pattern should we use?

In order of leverage:

1. **`inlineRequires: true`** (Metro) — cheapest, global; defers module
   top-level evaluation until first use. Great default for startup. (On Expo,
   you must enable it explicitly.)
2. **Dynamic `import()` / `React.lazy` + `Suspense`** for genuinely
   on-demand-heavy work (e.g. a screen, a parser, a charting lib). In React
   Native it won't split files, but it defers evaluation off the startup path and
   gives you an explicit async boundary (Promise + Suspense fallback).
3. **Don't import work at module top-level.** Keep side-effectful initialization
   inside functions so inline requires / `import()` can actually defer it.
   Inline requires can't help a module whose work runs at import time on the startup path.
4. If you want to defer *and* you care about size, you also need **tree shaking**
   (next question) — deferral alone never reduces what ships.

## 6. How does rnx-kit help? What does it add over Expo/vanilla defaults?

rnx-kit's headline feature here is **real tree shaking / dead-code elimination**
via the **esbuild serializer** (`@rnx-kit/metro-serializer-esbuild`), enabled
with `rnx-cli bundle --tree-shake`.

What changes:
- The serializer hands the module graph to **esbuild**, which does scope
  hoisting + tree shaking. Output is an esbuild IIFE bundle (`__commonJS`
  wrappers, readable `// node_modules/...` comments when unminified) — a totally
  different artifact from Metro's `__d(...)` registry.
- **Required gotcha:** esbuild can only tree-shake ESM, but
  `@react-native/babel-preset` rewrites `import/export` to CommonJS by default.
  You must set `disableImportExportTransform: true` for the production
  tree-shake build (or use `@rnx-kit/babel-preset-metro-react-native`).

Measured impact on our app:
- An unused export (`deadExport`) is **removed** from the tree-shaken bundle
  (present in vanilla/Expo, gone here).
- Minified size dropped **992 KB → 807 KB (~19%)** — mostly unused code pruned
  across the whole graph (including parts of react-native), not just our one
  function.

rnx-kit also adds (beyond default Expo/vanilla): duplicate-dependency &
cyclic-dependency detection, robust monorepo/symlink resolution
(`@rnx-kit/metro-config`), `--metafile` esbuild bundle analysis, dependency
alignment (`align-deps`), and a typed bundle config (`rnx-kit` field /
multi-bundle definitions).

What rnx-kit does **not** magically add: true React Native bundle splitting into
separately-loaded chunks — that remains a web-only concept.

---

## How to reproduce

```sh
# Vanilla: eager vs inline
cd vanilla-rn && npm run bundle:eager && npm run bundle:inline
#   inspect out/eager.bundle vs out/inline.bundle

# Expo: default (eager) vs forced inline; bytecode vs JS
cd expo-app && npx expo export -p ios --output-dir dist-default            # .hbc
npx expo export -p ios --no-bytecode --no-minify --output-dir dist-js      # readable JS
EXPO_INLINE=on npx expo export -p ios --no-bytecode --no-minify --output-dir dist-inline

# rnx-kit: plain vs tree-shaken
cd rnx-kit-app && npm run bundle:plain && npm run bundle:treeshake
#   compare out/plain.min.bundle vs out/treeshake.min.bundle (and out/meta.json)
```

---

## Annex — `_interopRequireDefault` and the import shape that defeats inline requires

**When is `_interopRequireDefault` added?** It's a *Babel* helper emitted by
`@babel/plugin-transform-modules-commonjs` (run by `@react-native/babel-preset`
by default). The helper is chosen by the *kind* of import:

| Import | Compiles to | Inlineable by Metro? |
|--------|-------------|----------------------|
| `import { x } from 'm'` (named) | `var _m = require('m')` | yes (bare require) |
| `const x = require('m')` | `require('m')` | yes |
| `import x from 'm'` (default) | `var _m = _interopRequireDefault(require('m'))` | **no** |
| `import * as x from 'm'` (namespace) | `var _m = _interopRequireWildcard(require('m'))` | **no** |

The wrappers exist to emulate ESM semantics over CommonJS (resolve `.default`
based on the `__esModule` flag; build a frozen namespace object).

**Why it defeats inline requires.** The inline-requires plugin only treats these
shapes as inlineable: a bare `require()`, or `importDefault(require())` /
`importAll(require())` — where `importDefault`/`importAll` are *Metro's* helpers
(`_$$_IMPORT_DEFAULT` / `_$$_IMPORT_ALL`), set via
`inlineableCalls: [importDefault, importAll]`. Babel's `_interopRequireDefault` /
`_interopRequireWildcard` have different names, so they're not matched and stay
hoisted (eager).

**This is the catch:** on a stock React Native project (Babel lowers ESM),
turning on `inlineRequires` does nothing for any dependency imported as a default
or namespace import — which is most heavy libraries (`import moment`,
`import axios`, `import * as d3`...). Only named imports and raw `require()` get
deferred.

**Proof (verified).** Fixture importing default + named + namespace, all used
only inside `run()`:
- Babel lowering (stock RN, inlineRequires:true):
  `run(){ return (0,t.default)() + (0,_r(d[3]).named)() + r.alpha() + r.beta() }`
  with `var t=_interopRequireDefault(...)`, `r=_interopRequireWildcard(...)` left
  EAGER at module top. Only the named import inlined.
- Metro lowering (`disableImportExportTransform:true` + `experimentalImportSupport:true`):
  `run(){ return i(d[0])() + r(d[1]).named() + a(d[2]).alpha() + a(d[2]).beta() }`,
  no top-level require vars — `i`=`_$$_IMPORT_DEFAULT`, `a`=`_$$_IMPORT_ALL`.
  ALL imports inlined.

**How to actually get deferral for default/namespace imports:**
- Let Metro lower imports instead of Babel: `disableImportExportTransform: true`
  on the RN babel preset + `experimentalImportSupport: true`.
- Expo already lowers via Metro (its factories take `_$$_IMPORT_DEFAULT,
  _$$_IMPORT_ALL`) — it just leaves `inlineRequires` off by default.
- rnx-kit's esbuild path sidesteps the issue entirely (ESM preserved, esbuild
  scope-hoists + tree-shakes).
- Cheap heuristic: prefer named imports (`import { thing } from 'm'`) over default
  imports where practical — they inline even under stock Babel.

(Block-listed modules — react, react-native, jsx runtimes — stay eager in both
lowering paths regardless; see Q1.)
