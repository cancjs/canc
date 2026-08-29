---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

Narrow debounce and throttle option types to reject unknown option keys at compile time. Negative jitter fractions in retry are now rejected with a RangeError at option-parse time rather than on the first failure.
