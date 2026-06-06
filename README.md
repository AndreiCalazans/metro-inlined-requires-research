How does React Native inlined requires work?

Metro has a flag for enabling inlined requires, but looks like Expo handles it a
bit different.

This experiement's purpose is to validate the difference between inlined
requires for Expo and vanilla React Native metro configuration.  Also review
rnx-kit to see how it can be used to improve this even further with their
inlined requires and bundle splitting features (https://microsoft.github.io/rnx-kit/docs/tools/overview)


Questions to answer:

1. How do inlined requires work?

2. When we enable Metro's inlineRequires to true what's the resulting output of
   the bundle look like?

Reference https://metrobundler.dev/docs/configuration/


3. How does Expo change Metro's inlineRequires behavior?


4. Does React Native Metro support bundle splitting? Does Hermes benefit from
   this at all?

5. When our intent is to defer JavaScript work, what pattern should we do?


6. How can rnx-kit help here? what does it support that defualt Expo and vanilla
   RN configurations does not support?
