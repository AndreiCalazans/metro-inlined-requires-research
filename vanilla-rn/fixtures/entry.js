import def from './def';            // default import
import { named } from './named';    // named import
import * as star from './star';     // namespace import

// All three used ONLY inside this function -> candidates for inline requires.
export function run() {
  return def() + named() + star.alpha() + star.beta();
}
