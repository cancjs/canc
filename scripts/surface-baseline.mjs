// Runs by CI, cron, or hand, over the built declarations rather than over src.
// Resolution relies on node_modules/@cancjs/* symlinks of the checkout it runs in;
// always run in the tree that built dist.
// Known limit: non-exported helper type shapes are not recorded.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';
import ts from 'typescript';

// Same options the markdown lint rule applies, so the committed file is already formatted and the
// generator and the linter never disagree about it.
const PRETTIER_MARKDOWN = {
  endOfLine: 'auto',
  singleQuote: true,
  parser: 'markdown',
  embeddedLanguageFormatting: 'off',
};

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const ROOT_POSIX = toPosix(ROOT);

function findPublishablePackages() {
  const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const patterns = (rootPkg.workspaces || []).filter((w) => w.startsWith('packages/'));
  const found = [];
  for (const pattern of patterns) {
    const baseDir = join(ROOT, pattern.replace(/\/\*$/, ''));
    if (!existsSync(baseDir)) continue;
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(baseDir, entry.name, 'package.json');
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        if (manifest.private !== true && Boolean(manifest.exports)) {
          found.push(manifest.name);
        }
      }
    }
  }
  found.sort();
  if (found.length !== 14) {
    throw new Error(`Expected 14 publishable packages, found ${found.length}: ${found.join(', ')}`);
  }
  return found;
}

const PUBLISHABLE_PACKAGES = findPublishablePackages();

// Resolution has to answer the way a consumer's does, so the program is configured off the shipped
// package rather than off the repo tsconfig: no `paths` aliases, so `@cancjs/promise` resolves
// through node_modules to its own published declarations.
const COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  lib: ['lib.es2022.d.ts'],
  strict: true,
  skipLibCheck: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  types: ['node'],
  noEmit: true,
};

// UseFullyQualifiedType is absent because it renders `Abortable` as
// `EventEmitter<T extends EventMap<T> = DefaultEventMap>.Abortable` in every options bag
const TYPE_FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  ts.TypeFormatFlags.WriteArrayAsGenericType;

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Rewrite one `import("...")` target into something a second machine produces byte for byte.
 *
 * A resolved type prints the realpath of whatever declared it, which is a checkout-specific
 * absolute path, and under npm workspaces even a dependency resolves to a sibling package
 * directory rather than to node_modules. Anything left absolute would make the artifact useless as
 * a diff, so an unrecognized one is an error rather than a best guess.
 */
function normalizeSpecifier(specifier) {
  const posix = toPosix(specifier);
  const marker = '/node_modules/';
  const at = posix.toLowerCase().lastIndexOf(marker);
  if (at !== -1) return posix.slice(at + marker.length);
  if (posix.toLowerCase().startsWith(`${ROOT_POSIX.toLowerCase()}/`)) return posix.slice(ROOT_POSIX.length + 1);
  if (/^([a-zA-Z]:)?\//.test(posix)) {
    throw new Error(`Unportable path in a rendered type: ${specifier}`);
  }
  return posix;
}

function normalize(text) {
  return text
    .replace(/import\("([^"]*)"\)/g, (_m, p) => `import("${normalizeSpecifier(p)}")`)
    .replace(/\s+/g, ' ')
    .trim();
}

function kindOf(symbol) {
  const f = symbol.flags;
  if (f & ts.SymbolFlags.Class) return 'class';
  if (f & ts.SymbolFlags.Interface) return 'interface';
  if (f & ts.SymbolFlags.TypeAlias) return 'type';
  if (f & (ts.SymbolFlags.RegularEnum | ts.SymbolFlags.ConstEnum)) return 'enum';
  if (f & ts.SymbolFlags.Function) return 'function';
  if (f & (ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) return 'namespace';
  if (f & ts.SymbolFlags.Variable) return 'const';
  if (f & (ts.SymbolFlags.Property | ts.SymbolFlags.Method)) return 'property';
  return 'unknown';
}

// A symbol-keyed member's internal name (`__@dispose@234`) ends in an id counter over everything
// the program loaded, which moves without the surface changing
function memberName(symbol) {
  const name = symbol.getName();
  const symbolKeyed = /^__@(.+)@\d+$/.exec(name);
  return symbolKeyed ? `[${symbolKeyed[1]}]` : name;
}

// This package's own .d.ts (dist/types, generated 1:1 from src) is the surface maintained by
// hand; a member declared anywhere else is only composed with, not authored here.
// Rendering is restricted to declarations the checker resolves under this package.
function isOwnDeclaration(node, pkgPosix) {
  if (!node) return false;
  const fileName = toPosix(node.getSourceFile().fileName);
  return fileName.toLowerCase().startsWith(`${pkgPosix.toLowerCase()}/`);
}

// A filtered member list drops the context an `extends` gave for free, so the clause is rendered
// verbatim from the declaration whenever one exists.
function heritageLines(decl) {
  const clauses =
    decl && (ts.isInterfaceDeclaration(decl) || ts.isClassDeclaration(decl)) ? decl.heritageClauses : undefined;
  if (!clauses) return [];
  return clauses.map((clause) => normalize(clause.getText()));
}

const DEPRECATED_MARK = '// @deprecated';

function hasDeprecatedTag(tags) {
  return !!tags && tags.some((t) => t.name === 'deprecated');
}

function isDeprecated(symbol) {
  return hasDeprecatedTag(symbol.getJsDocTags());
}

// A suffix, never a prefix: member lines are classified and sorted by their first characters
function withDeprecation(line, deprecated) {
  return deprecated ? `${line} ${DEPRECATED_MARK}` : line;
}

function typeParametersOf(symbol) {
  for (const decl of symbol.declarations || []) {
    if (decl.typeParameters && decl.typeParameters.length > 0) {
      return `<${decl.typeParameters.map((p) => normalize(p.getText())).join(', ')}>`;
    }
  }
  return '';
}

function createRenderer(program, checker, pkgPosix) {
  const primitiveMask =
    ts.TypeFlags.String |
    ts.TypeFlags.Number |
    ts.TypeFlags.Boolean |
    ts.TypeFlags.Enum |
    ts.TypeFlags.BigInt |
    ts.TypeFlags.StringLiteral |
    ts.TypeFlags.NumberLiteral |
    ts.TypeFlags.BooleanLiteral |
    ts.TypeFlags.EnumLiteral |
    ts.TypeFlags.BigIntLiteral |
    ts.TypeFlags.ESSymbol |
    ts.TypeFlags.UniqueESSymbol |
    ts.TypeFlags.Void |
    ts.TypeFlags.Undefined |
    ts.TypeFlags.Null |
    ts.TypeFlags.Never |
    ts.TypeFlags.Any |
    ts.TypeFlags.Unknown |
    ts.TypeFlags.TemplateLiteral |
    ts.TypeFlags.StringMapping;

  function isUnionOrPrimitive(type) {
    if (type.isUnion && type.isUnion()) return true;
    if ((type.flags & primitiveMask) !== 0) return true;
    if (type.isIntersection && type.isIntersection()) {
      if (type.types.every((t) => (t.flags & primitiveMask) !== 0)) return true;
    }
    return false;
  }

  // A constituent declared only in platform typings (default lib, @types/node) prints by name, so a
  // TypeScript or @types/node upgrade that reshapes AbortSignal does not move the baseline
  const isLibType = (type) => {
    const declarations = (type.aliasSymbol ?? type.symbol)?.declarations;
    return (
      !!declarations &&
      declarations.length > 0 &&
      declarations.every((d) => {
        const file = d.getSourceFile();
        return (
          program.isSourceFileDefaultLibrary(file) || toPosix(file.fileName).includes('/node_modules/@types/node/')
        );
      })
    );
  };

  const signatureLine = (signature, kind) =>
    withDeprecation(
      normalize(checker.signatureToString(signature, undefined, TYPE_FLAGS, kind)),
      hasDeprecatedTag(signature.getJsDocTags()),
    );

  const propertyLine = (property, prefix = '') => {
    const decl = property.declarations?.[0];
    // Mapped type members are synthesized symbols with no declaration, and the declared type of
    // one is `any`, so those go through getTypeOfSymbol
    const type = decl ? checker.getTypeOfSymbolAtLocation(property, decl) : checker.getTypeOfSymbol(property);
    const optional = property.flags & ts.SymbolFlags.Optional ? '?' : '';
    const declNode = decl ?? property.valueDeclaration;
    const readonly = declNode ? (ts.getCombinedModifierFlags(declNode) & ts.ModifierFlags.Readonly) !== 0 : false;
    const head = `${prefix}${readonly ? 'readonly ' : ''}${memberName(property)}${optional}`;
    return withDeprecation(
      `${head}: ${normalize(checker.typeToString(type, decl, TYPE_FLAGS))}`,
      isDeprecated(property),
    );
  };

  // `filterOwn` defaults on (the normal path); the false-cased call is the unfiltered safety net
  // below, for a type that turns out to be entirely a foreign re-export.
  const sortedProperties = (type, filterOwn = true) =>
    checker
      .getPropertiesOfType(type)
      .filter((p) => p.getName() !== 'prototype')
      .filter((p) => !filterOwn || isOwnDeclaration(p.declarations?.[0], pkgPosix))
      .sort((a, b) =>
        memberName(a) < memberName(b) ? -1
        : memberName(a) > memberName(b) ? 1
        : 0,
      );

  // The signature ladder in fs/wrap.ts pads its six slots by repeating the last real overload, so
  // collapsing identical renderings is what leaves the overload count a caller actually sees
  const dedupe = (lines) => {
    const seen = new Set();
    return lines.filter((line) => (seen.has(line) ? false : (seen.add(line), true)));
  };

  const isSignature = (line) => /^(?:new\s*[(<]|[(<])/.test(line);
  const isProperty = (line) => !isSignature(line) && /:\s/.test(line);

  const structural = (type, context) => {
    const heritage = heritageLines(context);

    // Signatures (call/construct overloads) are left unfiltered: a re-exported function's own
    // overload list is its entire public contract, not an inherited member, even when the
    // signature's declaration node resolves back through a foreign type alias.
    const collect = (filterOwn) => {
      const lines = [];
      for (const sig of checker.getSignaturesOfType(type, ts.SignatureKind.Construct)) {
        lines.push(signatureLine(sig, ts.SignatureKind.Construct));
      }
      for (const sig of checker.getSignaturesOfType(type, ts.SignatureKind.Call)) {
        lines.push(signatureLine(sig, ts.SignatureKind.Call));
      }
      const deduped = dedupe(lines);
      for (const property of sortedProperties(type, filterOwn)) {
        deduped.push(propertyLine(property));
      }
      return deduped;
    };

    let body = collect(true);
    // A type that is entirely a re-exported platform shape (fs.constants, a string-literal union)
    // and carries no heritage clause can lose every rendered line to the own-declaration filter.
    // Showing nothing would hide real public surface, so the unfiltered shape is the fallback, and
    // only a type with nothing to show even unfiltered reaches the typeToString fallback below.
    if (heritage.length === 0 && body.length === 0) body = collect(false);
    if (heritage.length === 0 && body.length === 0) {
      body.push(normalize(checker.typeToString(type, context, TYPE_FLAGS | ts.TypeFormatFlags.InTypeAlias)));
    }
    return [...heritage, ...body];
  };

  return function render(symbol) {
    const kind = kindOf(symbol);
    const decl = symbol.declarations?.[0];

    if (kind === 'class') {
      const staticType = checker.getTypeOfSymbolAtLocation(symbol, decl);
      const instanceType = checker.getDeclaredTypeOfSymbol(symbol);
      const heritage = heritageLines(decl);

      const collect = (filterOwn) => {
        const lines = [];
        for (const sig of checker.getSignaturesOfType(staticType, ts.SignatureKind.Construct)) {
          lines.push(signatureLine(sig, ts.SignatureKind.Construct));
        }
        for (const property of sortedProperties(staticType, filterOwn)) {
          lines.push(propertyLine(property, 'static '));
        }
        for (const property of sortedProperties(instanceType, filterOwn)) {
          lines.push(propertyLine(property));
        }
        return dedupe(lines);
      };

      let body = collect(true);
      if (heritage.length === 0 && body.length === 0) body = collect(false);
      return { kind, lines: [...heritage, ...body] };
    }

    if (kind === 'enum') {
      const lines = [];
      if (symbol.exports) {
        for (const m of symbol.exports.values()) {
          const declNode = m.valueDeclaration || m.declarations?.[0];
          const val = declNode ? checker.getConstantValue(declNode) : undefined;
          if (val !== undefined) {
            lines.push(
              withDeprecation(
                `${m.getName()} = ${typeof val === 'string' ? JSON.stringify(val) : val}`,
                isDeprecated(m),
              ),
            );
          } else {
            lines.push(withDeprecation(m.getName(), isDeprecated(m)));
          }
        }
      }
      return { kind, lines: lines.sort() };
    }

    if (kind === 'interface' || kind === 'type') {
      const type = checker.getDeclaredTypeOfSymbol(symbol);
      const isInter = type.isIntersection && type.isIntersection();
      const isInterNode = decl && ts.isTypeAliasDeclaration(decl) && ts.isIntersectionTypeNode(decl.type);
      if (isInter || isInterNode) {
        const constituents = isInter ? type.types : decl.type.types.map((n) => checker.getTypeFromTypeNode(n));
        const sigLines = [];
        const propLines = [];
        for (const c of constituents) {
          if (isUnionOrPrimitive(c) || isLibType(c)) {
            sigLines.push(normalize(checker.typeToString(c, decl, TYPE_FLAGS | ts.TypeFormatFlags.InTypeAlias)));
          } else {
            const lines = structural(c, decl);
            for (const line of lines) {
              if (isProperty(line)) {
                propLines.push(line);
              } else {
                sigLines.push(line);
              }
            }
          }
        }
        return { kind, lines: [...dedupe(sigLines), ...dedupe(propLines).sort()] };
      }
      if (isUnionOrPrimitive(type)) {
        return {
          kind,
          lines: [normalize(checker.typeToString(type, decl, TYPE_FLAGS | ts.TypeFormatFlags.InTypeAlias))],
        };
      }
      return { kind, lines: structural(type, decl) };
    }

    const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
    if (isUnionOrPrimitive(type)) {
      return {
        kind,
        lines: [normalize(checker.typeToString(type, decl, TYPE_FLAGS | ts.TypeFormatFlags.InTypeAlias))],
      };
    }
    return { kind, lines: structural(type, decl) };
  };
}

/** Published subpath to the declaration file a consumer's TypeScript picks for it. */
export function readEntryPoints(pkgJson) {
  const entries = [];
  for (const [subpath, condition] of Object.entries(pkgJson.exports || {})) {
    // string subpaths such as the manifest have no declarations to record
    if (subpath === './package.json' || typeof condition === 'string') continue;
    // The plain `types` key, never the `types@<4.7` sibling: the downlevel copy exists for a
    // resolver this script does not emulate, and both keys in one baseline would double every line.
    const dts = condition?.require?.types || condition?.import?.types;
    if (!dts) throw new Error(`No types condition for subpath ${subpath}`);
    entries.push({ subpath, dts: dts.replace(/^\.\//, '') });
  }
  entries.sort((a, b) =>
    a.subpath < b.subpath ? -1
    : a.subpath > b.subpath ? 1
    : 0,
  );
  return entries;
}

/** `.` becomes `index`, and a nested subpath keeps its segments joined by a dot. */
export function baselineFileName(subpath) {
  const bare = subpath === '.' ? 'index' : subpath.replace(/^\.\//, '').replace(/\//g, '.');
  return `${bare}.api.md`;
}

function isInternal(symbol) {
  if (symbol.getName().startsWith('_')) return true;
  const tags = symbol.getJsDocTags();
  if (tags && tags.some((t) => t.name === 'internal')) return true;
  return false;
}

function renderBaseline(subpath, dtsRelative, program, checker, pkgName, pkgDir, pkgPosix) {
  const sourceFile = program.getSourceFile(join(pkgDir, dtsRelative));
  if (!sourceFile) throw new Error(`Declaration file missing from the program: ${dtsRelative}`);

  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
  const render = createRenderer(program, checker, pkgPosix);

  const publicExports = [];
  const internalExports = [];

  for (const exported of exports) {
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const internal = isInternal(exported) || isInternal(target);
    const { kind, lines } = render(target);
    const deprecated = isDeprecated(exported) || isDeprecated(target);
    const entry = {
      name: exported.getName(),
      kind,
      params: typeParametersOf(target),
      lines: deprecated ? [DEPRECATED_MARK, ...lines] : lines,
    };
    if (internal) internalExports.push(entry);
    else publicExports.push(entry);
  }

  const sortByName = (a, b) =>
    a.name < b.name ? -1
    : a.name > b.name ? 1
    : 0;
  publicExports.sort(sortByName);
  internalExports.sort(sortByName);

  const out = [
    `# Public surface: ${pkgName} ${subpath}`,
    '',
    'Generated. Do not edit by hand.',
    '',
    `- Declarations: \`${relative(ROOT, join(pkgDir, dtsRelative)).replace(/\\/g, '/')}\``,
    `- Exports: ${exports.length}`,
    '',
  ];

  if (publicExports.length === 0 && internalExports.length === 0) {
    out.push('This subpath exports no names. It is imported for its side effect.');
  }

  for (const entry of publicExports) {
    out.push(`## \`${entry.name}${entry.params}\` (${entry.kind})`, '', '```text', ...entry.lines, '```', '');
  }

  if (internalExports.length > 0) {
    out.push('# Internal (not public)', '');
    for (const entry of internalExports) {
      out.push(`## \`${entry.name}${entry.params}\` (${entry.kind})`, '', '```text', ...entry.lines, '```', '');
    }
  }

  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

export async function generateBaselines(pkgName, pkgDir, pkgPosix) {
  const pkgJsonPath = join(pkgDir, 'package.json');
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const entryPoints = readEntryPoints(pkgJson);

  const missing = entryPoints.filter((e) => !existsSync(join(pkgDir, e.dts)));
  if (missing.length > 0) {
    throw new Error(
      `Run "npm run build -w ${pkgName}" before the surface baseline: ${missing.map((m) => m.dts).join(', ')}`,
    );
  }

  const rootNames = entryPoints.map((e) => join(pkgDir, e.dts));
  const program = ts.createProgram(rootNames, COMPILER_OPTIONS);
  const checker = program.getTypeChecker();

  const files = new Map();
  for (const entry of entryPoints) {
    const rendered = renderBaseline(entry.subpath, entry.dts, program, checker, pkgName, pkgDir, pkgPosix);
    files.set(baselineFileName(entry.subpath), await prettier.format(rendered, PRETTIER_MARKDOWN));
  }
  return files;
}

function digest(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

/** Minimal unified-style diff, so a failing check names the lines instead of the file. */
function diffLines(expected, actual) {
  const a = expected.split('\n');
  const b = actual.split('\n');
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`- ${a[i]}`);
      i += 1;
    } else {
      out.push(`+ ${b[j]}`);
      j += 1;
    }
  }
  for (; i < a.length; i += 1) out.push(`- ${a[i]}`);
  for (; j < b.length; j += 1) out.push(`+ ${b[j]}`);
  return out;
}

function getPkgDir(pkgName) {
  const bare = pkgName.replace('@cancjs/', 'canc-');
  if (bare.startsWith('canc-server-')) {
    return join(ROOT, 'packages', 'canc-server', bare);
  }
  return join(ROOT, 'packages', bare);
}

export async function run({ check = false, pkg = null } = {}) {
  const packages = pkg ? [pkg] : PUBLISHABLE_PACKAGES;
  let failed = false;

  for (const pkgName of packages) {
    const pkgDir = getPkgDir(pkgName);
    const pkgPosix = toPosix(pkgDir);
    const baselineDir = join(pkgDir, 'surface', 'baseline');
    const files = await generateBaselines(pkgName, pkgDir, pkgPosix);

    if (check) {
      const committed = existsSync(baselineDir) ? readdirSync(baselineDir).filter((f) => f.endsWith('.api.md')) : [];
      for (const name of committed) {
        if (!files.has(name)) {
          console.error(`Surface baseline check failed for ${pkgName}: ${name} has no published subpath`);
          failed = true;
        }
      }
      for (const [name, content] of files) {
        const path = join(baselineDir, name);
        if (!existsSync(path)) {
          console.error(`Surface baseline check failed for ${pkgName}: ${name} is missing`);
          failed = true;
          continue;
        }
        const onDisk = readFileSync(path, 'utf8');
        if (onDisk !== content) {
          console.error(`Surface baseline check failed for ${pkgName}: ${name} differs from the built declarations`);
          for (const line of diffLines(onDisk, content)) console.error(line);
          failed = true;
        }
      }
    } else {
      mkdirSync(baselineDir, { recursive: true });
      for (const name of readdirSync(baselineDir)) {
        if (name.endsWith('.api.md') && !files.has(name)) rmSync(join(baselineDir, name));
      }
      for (const [name, content] of files) {
        const path = join(baselineDir, name);
        if (!existsSync(path) || readFileSync(path, 'utf8') !== content) writeFileSync(path, content, 'utf8');
      }
    }

    // stdout carries the artifact digests and nothing else, so two runs match byte for byte whether
    // or not either of them wrote a file
    for (const [name, content] of files) {
      process.stdout.write(`${relative(ROOT, join(baselineDir, name)).replace(/\\/g, '/')} ${digest(content)}\n`);
    }
  }

  if (failed) {
    console.error('The published surface changed. Review the diff, then run the generator to accept it.');
    return 1;
  }

  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const isCheck = process.argv.includes('--check');
  const pkgArg = process.argv.find((arg) => arg.startsWith('--package='));
  const pkg = pkgArg ? pkgArg.split('=')[1] : null;

  run({ check: isCheck, pkg })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
