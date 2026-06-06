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
- `inlineRequires: true` (inline/lazy) — requires for modules used only inside
  callbacks are MOVED INTO the call site; the top only keeps requires used on
  the render path:
  ```js
  // top keeps: t,r (react), n (react-native), o (jsx-runtime)
  ...,n=_r(d[3]),o=_r(d[4])},2,[1,3,9,11,243,502,503]);
  // call site now requires lazily:
  onPress:()=>{var e=(0,_r(d[5]).heavyCompute)(1e3); ... _r(d[5]).HEAVY_TAG ...}
  onPress:()=>{ ... _r(d[6]).formatRare('inlined requires') ... }
  ```

**Key takeaways:**
- `react-native` (used during render) stays hoisted; `heavy`/`rare` (used only
  in handlers) get inlined to the handler. So the transform = "move `require()`
  to first use", deferring *evaluation*, not *inclusion*.
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
var _react = require(...); var _reactNative = require(...);   // render path, eager
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

