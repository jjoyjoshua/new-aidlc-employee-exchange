import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// US-033/AC-08: the product serves exactly one office in this release, so no screen may offer
// an office, site or location selector — anywhere. Confirmed absent by a targeted grep while
// planning this story; this makes that a standing, re-checked assertion rather than a one-time
// observation that can silently go stale as new screens are added.
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.spec\.(ts|tsx)$/.test(name)) {
      files.push(full);
    }
  }
  return files;
}

// Matches a plausible office/site/location-selector control: a component name, an aria-label,
// or a select/combobox whose name mentions the office/site/location. Deliberately does NOT
// flag `format-office-date.ts`, `use-desks.ts`, or copy strings that merely mention "office" —
// this is an absence check for a SELECTOR, not for the word "office".
const LOCATION_SELECTOR_PATTERN =
  /office[-_]?select|location[-_]?select|site[-_]?select|<OfficeSelector|<LocationPicker|<SitePicker|aria-label=["'][^"']*(?:choose|select|switch)[^"']*(?:office|site|location)/i;

describe('No screen offers an office, site or location selector (US-033/AC-08)', () => {
  it('no source file under apps/ui/src matches a location-selector pattern (US-033/AC-08)', () => {
    const offenders = sourceFiles(SRC_ROOT)
      .filter((file) => LOCATION_SELECTOR_PATTERN.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC_ROOT.length + 1));

    expect(offenders).toEqual([]);
  });
});
