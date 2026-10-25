# Builds g2-expected.json from research/g2-dane.json (the g2 measurement of 2026-10-23) for test/fit/g2.test.ts.
# Usage: python3 -I test/fit/fixtures/build-g2-expected.py <research/g2-dane.json> > test/fit/fixtures/g2-expected.json
import json, sys

d = json.load(open(sys.argv[1]))
dev = '0.10.1-develop.7583.1.0c886d0a14'
ver = lambda v: dev if v == 'develop' else v
out = {
    'source': 'research/g2-dane.json (macierz, kontrola_0.9.0, kontrola_ujemna)',
    'matrix': {
        'npm:%s@%s' % (r['name'], r['ver']): {
            'cells': {ver(v): {'fits': c['ok'], 'peersAccept': c['decl'], 'checked': c['checked'], 'typeIssues': c['typeIssues']}
                      for v, c in r['cells'].items()},
            'driftToNext': r['drift']['0.9.0->develop']['changed'],
        }
        for r in d['macierz']
    },
    'control090': {'npm:%s@0.9.0' % k['name']: {'checked': k['checked'], 'issues': len(k['issues'])} for k in d['kontrola_0.9.0']},
    'negativeControl': {
        'npm:%s@0.9.0' % r['name']: {ver(v): r[v] for v in ['0.7.0', '0.8.0', '0.9.0', 'develop']}
        for r in d['kontrola_ujemna']
    },
}
json.dump(out, sys.stdout, indent=1)
