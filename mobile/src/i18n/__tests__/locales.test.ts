import { LANGUAGE_CODES, LANGUAGES, resolveDeviceLanguage, selectableLanguages } from '../languages';
import { resources } from '../resources';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      out[path] = value;
    } else {
      Object.assign(out, flatten(value, path));
    }
  }
  return out;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1] ?? '').sort();
}

const english = flatten(resources.en.common as Tree);

describe('locale resources', () => {
  it('has a resource file for every registered language', () => {
    for (const code of LANGUAGE_CODES) {
      expect(resources[code]).toBeDefined();
    }
  });

  it('English has no empty strings', () => {
    for (const [key, value] of Object.entries(english)) {
      expect({ key, empty: value.trim() === '' }).toEqual({ key, empty: false });
    }
  });

  describe.each(LANGUAGE_CODES.filter((code) => code !== 'en'))('%s', (code) => {
    const translated = flatten(resources[code].common as Tree);
    const status = LANGUAGES[code].status;

    it('only contains keys that exist in English', () => {
      const unknown = Object.keys(translated).filter((key) => !(key in english));
      expect(unknown).toEqual([]);
    });

    it('uses the same interpolation placeholders as English', () => {
      for (const [key, value] of Object.entries(translated)) {
        expect({ key, placeholders: placeholders(value) }).toEqual({
          key,
          placeholders: placeholders(english[key] ?? ''),
        });
      }
    });

    if (status === 'complete' || status === 'draft') {
      it(`is fully translated (status: ${status})`, () => {
        const missing = Object.keys(english).filter((key) => !translated[key]?.trim());
        expect(missing).toEqual([]);
      });
    }
  });
});

describe('language registry', () => {
  it('only offers translated languages for selection', () => {
    const codes = selectableLanguages().map((l) => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('hi');
    expect(codes).not.toContain('ta');
  });

  it('resolves the first selectable device language', () => {
    expect(resolveDeviceLanguage([{ languageCode: 'hi' }, { languageCode: 'en' }])).toBe('hi');
    expect(resolveDeviceLanguage([{ languageCode: 'ta' }, { languageCode: 'hi' }])).toBe('hi');
  });

  it('falls back to English for unknown or untranslated device languages', () => {
    expect(resolveDeviceLanguage([{ languageCode: 'fr' }])).toBe('en');
    expect(resolveDeviceLanguage([{ languageCode: 'ta' }])).toBe('en');
    expect(resolveDeviceLanguage([{ languageCode: null }])).toBe('en');
  });

  it('gives every language an Indian-region speech tag', () => {
    for (const code of LANGUAGE_CODES) {
      expect(LANGUAGES[code].speechTag).toMatch(new RegExp(`^${code}-IN$`));
    }
  });
});
