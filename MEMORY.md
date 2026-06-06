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

