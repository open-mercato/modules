# Builds g2-imports.json from the g2 static scans (spikes/g2/out/*.json, AST only, nothing executed).
# Usage: python3 -I test/fit/fixtures/build-g2-imports.py <spikes/g2/out> > test/fit/fixtures/g2-imports.json
# Then run Prettier on the output. Sets: 16 packages outside @open-mercato (g2 "community" run) and the
# 23 official packages at 0.9.0 without core and canaries (g2 "control" run), exactly as compat.mjs selects them.
import json, os, re, sys

out_dir = sys.argv[1]
rows = []
for f in sorted(os.listdir(out_dir)):
    if not f.endswith('.json'):
        continue
    d = json.load(open(os.path.join(out_dir, f)))
    name, version = d['name'], d['version']
    official = name.startswith('@open-mercato/')
    if official and (re.search(r'canary|develop', version) or name == '@open-mercato/core'):
        continue
    imports = {}
    for i in d['imports']:
        imports.setdefault(i['pkg'], {})[i['subpath']] = sorted(i['symbols'].keys())
    rows.append({
        'set': 'control' if official else 'external',
        'locator': 'npm:' + name,
        'version': version,
        'omPeers': {k: v for k, v in sorted(d['peerDependencies'].items()) if k.startswith('@open-mercato/')},
        'dependencies': dict(sorted(d['dependencies'].items())),
        'imports': imports,
    })
rows.sort(key=lambda r: (r['set'], r['locator']))
json.dump({'source': 'spikes/g2/out (scan.mjs, 2026-10-23)', 'packages': rows}, sys.stdout, indent=1)
