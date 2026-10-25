#!/usr/bin/env python3
"""Builds test/fixtures/data (a snapshot of the `data` branch) for 8 entries and 3 built-in modules.

Provenance is described in test/fixtures/README.md. Static reads only, nothing from a tarball is executed.
Inputs (run with `python3 -I test/fixtures/build-data.py`; `--add-classic` needs none of them, it rewrites the receipts
of an existing snapshot with the classic copies of build_receipts):
- FIXTURE_INPUTS: a directory with npm/<name>.json packuments, gh/<owner>_<repo>.json and
  gh/<owner>_<repo>_tags.json (`gh api`), and tgz/x-<tarball>/package trees extracted from the
  published tarballs (module packages and create-mercato-app 0.8.0, 0.9.0, develop).
- G2_OUT: g2 scan outputs (default ~/kod/katalog-src/spikes/g2/out).
- RESEARCH: research folder with g2-dane.json and i4-inwentarz-modulow.json.
- node_modules/@open-mercato/cli (installed by `yarn install`) for module-facts.v2.json.
"""
import hashlib, json, os, re, sys, glob

ADD_CLASSIC = '--add-classic' in sys.argv
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(REPO, 'test/fixtures/data')
G2OUT = os.environ.get('G2_OUT', os.path.expanduser('~/kod/katalog-src/spikes/g2/out'))
RES = os.environ.get('RESEARCH', 'research')
if not ADD_CLASSIC:
    S = os.environ['FIXTURE_INPUTS']
    G2 = json.load(open(os.path.join(RES, 'g2-dane.json')))
    I4 = {r['name']: r for r in json.load(open(os.path.join(RES, 'i4-inwentarz-modulow.json')))}
MF = json.load(open(os.path.join(REPO, 'node_modules/@open-mercato/cli/dist/agentic/guides/module-facts.v2.json')))

NEXT = '0.10.1-develop.7583.1.0c886d0a14'
LINES = [('0.8', '0.8.0'), ('0.9', '0.9.0'), ('next', NEXT)]
LINE_OF = {v: k for k, v in LINES}
T_WATCH = '2026-10-23T00:17:00Z'
T_SYNC = '2026-10-23T00:20:00Z'
T_NIGHT = '2026-10-23T02:17:00Z'
T_COLLECT = '2026-10-23T03:05:00Z'
HARNESS_HASH = hashlib.sha256(b'fixture harness: harness/ is not written yet (WP07)').hexdigest()
NODE = '24.21.0'
APP_YARN = '4.17.1'  # packageManager of create-mercato-app 0.8.0, 0.9.0 and develop templates
CORE_IDS = sorted(k for k, m in MF.items() if m.get('sourcePackage') == '@open-mercato/core')

ENTRIES = [
    dict(key='ksef', locator='npm:@fastwhitecat/integration-ksef-direct', npm='@fastwhitecat/integration-ksef-direct', ver='0.1.8',
         g2='fastwhitecat-integration-ksef-direct-0.1.8', tgz='x-integration-ksef-direct-0.1.8', github='FastWhiteCat/openmercato-module-ksef',
         gh='FastWhiteCat_openmercato-module-ksef', type='3rd-party', typeReason='Owner FastWhiteCat is not a public member of open-mercato and not in policy/community.yml (D-OPEN-6 open).'),
    dict(key='consents', locator='npm:@piotrkarwatka/marketing-consents', npm='@piotrkarwatka/marketing-consents', ver='0.1.0',
         g2='piotrkarwatka-marketing-consents-0.1.0', tgz='x-marketing-consents-0.1.0', github='pkarw/marketing-consents',
         gh='pkarw_marketing-consents', type='community', typeReason='Repository owner pkarw is listed in policy/community.yml.'),
    dict(key='durable', locator='npm:@fullstackhouse/open-mercato-durable-work', npm='@fullstackhouse/open-mercato-durable-work', ver='0.6.0',
         g2='fullstackhouse-open-mercato-durable-work-0.6.0', tgz='x-open-mercato-durable-work-0.6.0', github=None,
         gh=None, type='3rd-party', typeReason='Repository fullstackhouse/open-mercato-durable returns 404; npm scope is not in policy/community.yml.'),
    dict(key='datasync', locator='npm:@fullstackhouse/open-mercato-data-sync-durable', npm='@fullstackhouse/open-mercato-data-sync-durable', ver='0.6.0',
         g2='fullstackhouse-open-mercato-data-sync-durable-0.6.0', tgz='x-open-mercato-data-sync-durable-0.6.0', github=None,
         gh=None, type='3rd-party', typeReason='Repository fullstackhouse/open-mercato-durable returns 404; npm scope is not in policy/community.yml.', replaces=['core:data_sync']),
    dict(key='stripe', locator='npm:@open-mercato/gateway-stripe', npm='@open-mercato/gateway-stripe', ver='0.9.0',
         g2='open-mercato-gateway-stripe-0.9.0', tgz='x-gateway-stripe-0.9.0', github='open-mercato/open-mercato',
         gh='open-mercato_open-mercato', type='official', typeReason='Scope @open-mercato.'),
    dict(key='tpay', locator='npm:@open-mercato/gateway-tpay', npm='@open-mercato/gateway-tpay', ver='0.8.1-develop.7442.1.4c1dbf1f0e',
         g2='open-mercato-gateway-tpay-0.8.1-develop.7442.1.4c1dbf1f0e', tgz='x-gateway-tpay-0.8.1-develop.7442.1.4c1dbf1f0e', github='open-mercato/open-mercato',
         gh='open-mercato_open-mercato', type='official', typeReason='Scope @open-mercato.'),
    dict(key='enterprise', locator='npm:@open-mercato/enterprise', npm='@open-mercato/enterprise', ver='0.9.0',
         g2='open-mercato-enterprise-0.9.0', tgz='x-enterprise-0.9.0', github='open-mercato/open-mercato',
         gh='open-mercato_open-mercato', type='official', typeReason='Scope @open-mercato.', enterprise=True),
    dict(key='treg', locator='github:Chmarusso/open-mercato-enrichment-treg', npm=None, ver=None,
         g2=None, tgz=None, github='Chmarusso/open-mercato-enrichment-treg',
         gh='Chmarusso_open-mercato-enrichment-treg', type='3rd-party', typeReason='Owner Chmarusso is not a public member of open-mercato and not in policy/community.yml.'),
]
BUILTINS = ['currencies', 'data_sync', 'wms']


def locpath(loc):
    if loc.startswith('npm:'):
        return loc[4:]
    owner, repo = loc[7:].split('/')
    return f'github/{owner.lower()}/{repo.lower()}'


def write_json(rel, obj):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write('\n')


def write_jsonl(rel, rows):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')


def packument(name):
    return json.load(open(os.path.join(S, 'npm', name.replace('/', '_').replace('@', '_') + '.json')))


def ghrepo(slug):
    if not slug:
        return None, None
    return json.load(open(os.path.join(S, 'gh', slug + '.json'))), json.load(open(os.path.join(S, 'gh', slug + '_tags.json')))


def is_stable(v):
    return re.fullmatch(r'\d+\.\d+\.\d+', v) is not None


def vkey(v):
    core = v.split('-')[0]
    return tuple(int(x) for x in core.split('.'))


def iso(t):
    # npm times have milliseconds; keep ISO 8601 with Z
    return re.sub(r'\.\d+Z$', 'Z', t)


# ---------------------------------------------------------------- static reads of a tarball

def files_under(root):
    out = []
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in ('node_modules',)]
        for f in fn:
            out.append(os.path.join(dp, f))
    return out


def rel(pkgroot, p):
    return os.path.relpath(p, pkgroot).replace(os.sep, '/')


def find_line(path, pattern):
    try:
        for i, line in enumerate(open(path, encoding='utf-8', errors='replace'), 1):
            if re.search(pattern, line):
                return i
    except FileNotFoundError:
        return None
    return None


def resolve_const(modroot, name):
    for f in files_under(modroot):
        if not f.endswith(('.ts', '.tsx')):
            continue
        m = re.search(r'(?:const|let)\s+' + re.escape(name) + r"\s*=\s*['\"]([^'\"]+)['\"]", open(f, encoding='utf-8', errors='replace').read())
        if m:
            return m.group(1)
    return None


def snake(name):
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


def level(n):
    return 0 if n == 0 else 1 if n == 1 else 2 if n < 10 else 3


def module_facts(pkgroot, g2rec, modid, descriptor_hosts=None):
    f = g2rec['facts'][modid]
    modroot = os.path.join(pkgroot, 'src/modules', modid)
    src_files = [p for p in files_under(modroot) if p.endswith(('.ts', '.tsx')) and '__tests__' not in p and '__integration__' not in p]
    diags = []
    # entities with table and class line
    entities = []
    ent_ids = list(f.get('entityIds') or [])
    tables = {}
    for p in src_files:
        if '/data/' not in p:
            continue
        lines = open(p, encoding='utf-8', errors='replace').read().split('\n')
        pending = None
        for i, line in enumerate(lines, 1):
            m = re.search(r"@Entity\(\{\s*tableName:\s*['\"]([a-z0-9_]+)['\"]", line)
            if m:
                pending = m.group(1)
                continue
            m = re.search(r'export\s+(?:abstract\s+)?class\s+(\w+)', line)
            if m and pending:
                tables[f'{modid}:{snake(m.group(1))}'] = (pending, rel(pkgroot, p), i)
                pending = None
    for eid in ent_ids:
        t = tables.get(eid)
        entities.append({'id': eid, 'table': t[0] if t else None, 'src': {'file': t[1], 'line': t[2]} if t else None})
    # migrations
    migdir = os.path.join(modroot, 'migrations')
    migs = sorted(x for x in (os.listdir(migdir) if os.path.isdir(migdir) else []) if re.match(r'Migration\d{14}', x) and x.endswith('.ts'))
    dates = [f'{m[9:13]}-{m[13:15]}-{m[15:17]}' for m in migs]
    # routes
    routes = []
    for r in (g2rec.get('api') or {}).get(modid, []):
        path = r['path']
        mm = re.match(r'^/' + modid + r'/(get|post|put|patch|delete)/(.*)$', path)
        public = '/api/' + mm.group(2) if mm else '/api' + path
        fpath = os.path.join(pkgroot, r['file'])
        line = find_line(fpath, r'export\s+(?:async\s+)?(?:function|const)\s+' + r['method'] + r'\b') or find_line(fpath, r'export\s+(?:default|async|function|const)') or 1
        routes.append({'method': r['method'], 'path': public, 'requireAuth': r.get('requireAuth'), 'requireFeatures': r.get('requireFeatures') or [],
                       'hasOpenApi': bool(r.get('hasOpenApi')), 'src': {'file': r['file'], 'line': line}})
    legacy = sum(1 for r in (g2rec.get('api') or {}).get(modid, []) if re.match(r'^/' + modid + r'/(get|post|put|patch|delete)/', r['path']))
    resolved = [r for r in routes if r['requireAuth'] is not None]
    auth_resolved = round(len(resolved) / len(routes), 4) if routes else 1
    # events
    ev_file = os.path.join(modroot, 'events.ts')
    emits = []
    for eid in f.get('eventIds') or []:
        ln = find_line(ev_file, r"['\"]" + re.escape(eid.split('.', 1)[1] if False else eid) + r"['\"]")
        if ln is None:
            parts = eid.split('.')
            ln = find_line(ev_file, r"entity:\s*['\"]" + re.escape(parts[1]) + r"['\"].*action:\s*['\"]" + re.escape(parts[-1]) + r"['\"]") if len(parts) >= 3 else None
        emits.append({'id': eid, 'src': {'file': rel(pkgroot, ev_file), 'line': ln} if ln else None})
    subscribes = []
    extends = []
    own_events = set(f.get('eventIds') or [])
    for c in f.get('contributionList') or []:
        if c['kind'] == 'subscriber':
            ev = c.get('target') or (c.get('details') or {}).get('event')
            if ev:
                sub_src = None
                subdir = os.path.join(modroot, 'subscribers')
                for p in files_under(subdir) if os.path.isdir(subdir) else []:
                    ln = find_line(p, re.escape(c['id'].split('.')[-1])) or find_line(p, re.escape(ev))
                    if ln:
                        sub_src = {'file': rel(pkgroot, p), 'line': ln}
                        break
                subscribes.append({'event': ev, 'src': sub_src})
        targets = [t['id'] for t in c.get('targets') or []]
        foreign = [t for t in targets if t not in own_events and not t.startswith(modid)]
        for t in foreign:
            extends.append({'kind': c['kind'], 'target': t[:120]})
    # pages
    backend = []
    bdir = os.path.join(modroot, 'backend')
    for p in sorted(files_under(bdir)) if os.path.isdir(bdir) else []:
        if os.path.basename(p) in ('page.tsx', 'page.ts'):
            d = os.path.dirname(rel(modroot + '/backend', p)) if False else os.path.relpath(os.path.dirname(p), bdir).replace(os.sep, '/')
            path = '/backend' + ('' if d == '.' else '/' + d)
            meta = os.path.join(os.path.dirname(p), 'page.meta.ts')
            feats = []
            if os.path.exists(meta):
                m = re.search(r'requireFeatures:\s*\[([^\]]*)\]', open(meta).read())
                if m:
                    feats = re.findall(r"['\"]([a-z0-9_.*-]+)['\"]", m.group(1))
            backend.append({'path': path, 'requireFeatures': feats[:10]})
    frontend = []
    fdir = os.path.join(modroot, 'frontend')
    for p in sorted(files_under(fdir)) if os.path.isdir(fdir) else []:
        if os.path.basename(p) in ('page.tsx', 'page.ts'):
            d = os.path.relpath(os.path.dirname(p), fdir).replace(os.sep, '/')
            frontend.append({'path': '/' + ('' if d == '.' else d)})
    widgets_dir = os.path.join(modroot, 'widgets')
    widgets = len([p for p in files_under(widgets_dir) if p.endswith(('.ts', '.tsx'))]) if os.path.isdir(widgets_dir) else 0
    # workers
    workers = []
    wdir = os.path.join(modroot, 'workers')
    for p in sorted(files_under(wdir)) if os.path.isdir(wdir) else []:
        m = re.search(r"queue:\s*(?:['\"]([a-z0-9_.:-]+)['\"]|([A-Z_][A-Z0-9_]*))", open(p, encoding='utf-8', errors='replace').read())
        if m:
            q = m.group(1) or resolve_const(modroot, m.group(2))
            if q and re.fullmatch(r'[a-z0-9_.:-]{1,80}', q):
                workers.append({'queue': q})
            else:
                diags.append(f'worker queue not resolved statically in {rel(pkgroot, p)}')
    # cli
    cli = []
    for p in src_files:
        if os.path.basename(p) == 'cli.ts':
            cli += re.findall(r"command:\s*['\"]([a-z0-9:_-]{1,60})['\"]", open(p, encoding='utf-8', errors='replace').read())
    if f.get('cli') and len(cli) != f['cli']:
        diags.append(f'cli: extractor counted {f["cli"]}, static names found {len(cli)}')
    # credentials from integration.ts
    creds = []
    integ = os.path.join(modroot, 'integration.ts')
    if os.path.exists(integ):
        txt = open(integ, encoding='utf-8', errors='replace').read()
        for m in re.finditer(r"key:\s*['\"]([a-zA-Z0-9_]{1,64})['\"][^}]*?type:\s*['\"]([a-z-]{1,20})['\"][^}]*?required:\s*(true|false)", txt, re.S):
            creds.append({'key': m.group(1), 'type': m.group(2), 'required': m.group(3) == 'true'})
    # env and hosts
    env, hosts = [], []
    seen_env, seen_host = set(), set()
    for p in sorted(src_files):
        for i, line in enumerate(open(p, encoding='utf-8', errors='replace'), 1):
            for name in re.findall(r'process\.env\.([A-Z][A-Z0-9_]{1,63})', line):
                if name not in seen_env:
                    seen_env.add(name)
                    env.append({'name': name, 'src': {'file': rel(pkgroot, p), 'line': i}})
            for h in re.findall(r"['\"`]https://([a-z0-9.-]+\.[a-z]{2,63})", line):
                if h not in seen_host and not h.endswith(('example.com', 'localhost')):
                    seen_host.add(h)
                    hosts.append({'host': h, 'src': {'file': rel(pkgroot, p), 'line': i}, 'confidence': 'high'})
    undeclared = [] if descriptor_hosts is None else [h['host'] for h in hosts if h['host'] not in descriptor_hosts]
    # om imports
    om = {}
    for imp in g2rec.get('imports') or []:
        om.setdefault(imp['pkg'], {})[imp['subpath']] = sorted(imp['symbols'].keys())[:50]
    acl = list(f.get('aclIds') or [])
    setup = os.path.join(modroot, 'setup.ts')
    sdrf = bool(os.path.exists(setup) and 'defaultRoleFeatures' in open(setup).read())
    requires = [{'raw': r, 'resolvesTo': f'core:{r}' if r in CORE_IDS else None} for r in (f.get('requires') or [])]
    public_routes = sum(1 for r in routes if r['requireAuth'] is False or r['requireAuth'] is None and not r['requireFeatures'])
    counts = dict(D=len(entities) + (1 if migs else 0), A=len(routes), U=len(backend) + len(frontend) + widgets,
                  E=len(emits) + len(subscribes), B=len(workers) + len(cli), I=0, X=len(extends))
    glyph = ''.join(str(level(counts[k])) for k in 'DAUEBIX')
    lint = []
    bad_events = [e['id'] for e in emits if not e['id'].startswith(modid + '.')]
    if bad_events:
        lint.append({'code': 'event-prefix', 'severity': 'warn', 'message': f'{len(bad_events)} event IDs do not start with {modid}. (for example {bad_events[0]}).',
                     'anchor': 'AGENTS.md:206', 'src': emits[0]['src']})
    if sdrf is False and acl:
        lint.append({'code': 'setup-default-role-features', 'severity': 'warn', 'message': 'acl.ts declares features but setup.ts has no defaultRoleFeatures.',
                     'anchor': 'module-development.md:48', 'src': None})
    EV_RE = r'[a-z0-9_]+(\.[a-z0-9_*-]+){1,5}'
    rejected = [x['event'] for x in subscribes if not re.fullmatch(EV_RE, x['event'])]
    if rejected:
        subscribes[:] = [x for x in subscribes if re.fullmatch(EV_RE, x['event'])]
        lint.append({'code': 'invalid-identifier', 'severity': 'warn', 'message': f'Rejected {len(rejected)} subscribed event IDs that fail the pattern (for example {json.dumps(rejected[0])}).', 'anchor': None, 'src': None})
    no_openapi = [r for r in routes if not r['hasOpenApi']]
    if no_openapi:
        lint.append({'code': 'route-openapi', 'severity': 'info', 'message': f'{len(no_openapi)} of {len(routes)} routes have no openApi.', 'anchor': 'module-development.md:44', 'src': no_openapi[0]['src']})
    if public_routes:
        pr = [r for r in routes if r['requireAuth'] is False or r['requireAuth'] is None and not r['requireFeatures']]
        lint.append({'code': 'public-routes', 'severity': 'info', 'message': f'{public_routes} routes without requireAuth.', 'anchor': None, 'src': pr[0]['src']})
    counts['E'] = len(emits) + len(subscribes)
    glyph = ''.join(str(level(counts[k])) for k in 'DAUEBIX')
    return {
        'id': modid, 'title': (f.get('title') or None) and f['title'][:80], 'description': (f.get('description') or None) and f['description'][:300],
        'requires': requires, 'ejectable': f.get('ejectable'),
        'data': {'entities': entities, 'migrations': {'count': len(migs), 'first': dates[0] if dates else None, 'last': dates[-1] if dates else None}, 'customEntities': 0},
        'http': {'routes': routes, 'legacyRouteFiles': legacy, 'authResolved': auth_resolved},
        'security': {'aclFeatures': acl, 'setupDefaultRoleFeatures': sdrf},
        'events': {'emits': emits, 'subscribes': subscribes},
        'ui': {'backendPages': backend, 'frontendPages': frontend, 'widgets': widgets, 'extensionHosts': f.get('hosts') or 0},
        'background': {'workers': workers, 'cli': cli},
        'ai': {'tools': [], 'agents': []},
        'config': {'credentials': creds, 'env': env},
        'network': {'hosts': hosts, 'undeclared': undeclared},
        'extends': extends,
        'omImports': om,
        'collisionKeys': {'moduleId': modid, 'tables': [e['table'] for e in entities if e['table']], 'aclFeatures': acl, 'eventIds': [e['id'] for e in emits],
                          'backendRoutes': [b['path'] for b in backend]},
        'publicRoutes': public_routes,
        'glyph': glyph,
        'lint': lint,
    }, diags


def license_info(pkgroot, pj, modids):
    pj_lic = pj.get('license')
    lf = None
    for name in os.listdir(pkgroot):
        if name.upper().startswith('LICENSE'):
            head = open(os.path.join(pkgroot, name), encoding='utf-8', errors='replace').read(200)
            lf = 'MIT' if head.startswith('MIT License') else 'custom'
    integ = None
    for mid in modids:
        p = os.path.join(pkgroot, 'src/modules', mid, 'integration.ts')
        if os.path.exists(p):
            m = re.search(r"license:\s*['\"]([^'\"]+)['\"]", open(p).read())
            if m:
                integ = m.group(1)
    value = pj_lic
    if pj_lic and pj_lic.startswith('SEE LICENSE IN'):
        kind = 'enterprise'
    elif pj_lic in ('UNLICENSED', 'PROPRIETARY'):
        kind = 'proprietary'
    elif pj_lic:
        kind = 'osi'
    else:
        kind = 'unknown'
    srcs = [x for x in (pj_lic, lf if lf != 'custom' else None, integ) if x]
    mismatch = len(set(srcs)) > 1 and kind != 'enterprise'
    return {'value': value, 'kind': kind, 'mismatch': mismatch, 'sources': {'packageJson': pj_lic, 'licenseFile': lf, 'moduleInfo': None, 'integrationTs': integ}}


def build_facts(e):
    pkgroot = os.path.join(S, 'tgz', e['tgz'], 'package')
    g2rec = json.load(open(os.path.join(G2OUT, e['g2'] + '.json')))
    pj = json.load(open(os.path.join(pkgroot, 'package.json')))
    pk = packument(e['npm'])
    v = pk['versions'][e['ver']]
    modids = [m['id'] for m in g2rec['gate']['modules']]
    mods, diags = [], []
    for mid in modids:
        mf, d = module_facts(pkgroot, g2rec, mid)
        mods.append(mf)
        diags += d
    diags += [w[:300] for mid in modids for w in (g2rec['facts'][mid].get('warningSamples') or [])]
    readme = None
    for name in ('README.md', 'readme.md'):
        p = os.path.join(pkgroot, name)
        if os.path.exists(p):
            readme = open(p, encoding='utf-8', errors='replace').read()[:1200]
    total_ms = sum(g2rec['facts'][m].get('ms', 0) for m in modids)
    routes = [r for m in mods for r in m['http']['routes']]
    resolved = sum(1 for r in routes if r['requireAuth'] is not None)
    integ = any(os.path.exists(os.path.join(pkgroot, 'src/modules', m, 'integration.ts')) for m in modids)
    facts = {
        'factsVersion': 1,
        'extractor': {'engine': '@open-mercato/cli@0.9.0 extractModuleFacts', 'factsContractVersion': 2, 'catalog': 'fixture-wp01', 'durationMs': total_ms},
        'package': {'locator': e['locator'], 'name': e['npm'], 'version': e['ver'], 'integrity': v['dist']['integrity'], 'source': 'npm-tarball', 'gitRef': v.get('gitHead')},
        'gate': {'installable': g2rec['gate']['installable'], 'needsModuleFlag': g2rec['gate']['needsModuleFlag'], 'reason': None,
                 'modules': [{'id': m['id'], 'src': m['srcDir'], 'dist': m['distDir']} for m in g2rec['gate']['modules']]},
        'kind': 'module',
        'license': license_info(pkgroot, pj, modids),
        'omPeers': {k: val for k, val in (pj.get('peerDependencies') or {}).items() if k.startswith('@open-mercato/')},
        'dependencies': pj.get('dependencies') or {},
        'agentsMd': os.path.exists(os.path.join(pkgroot, 'AGENTS.md')),
        'readmeExcerpt': readme,
        'modules': mods,
        'coverage': {'routesAuthResolved': round(resolved / len(routes), 4) if routes else 1, 'integrationTs': 'expanded' if integ else 'absent'},
        'diagnostics': diags[:50],
    }
    # lint that needs package-level data
    if e['key'] == 'consents':
        facts['modules'][0]['lint'].append({'code': 'host-dependency-duplication', 'severity': 'warn',
            'message': 'Bundles @tanstack/react-table 9.2.6 while Open Mercato 0.9.0 ships 9.3.1. Two copies break types. Move it to peerDependencies.',
            'anchor': None, 'src': {'file': 'package.json', 'line': find_line(os.path.join(pkgroot, 'package.json'), '@tanstack/react-table') or 1}})
    peers = facts['omPeers']
    if peers and all(re.fullmatch(r'\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?', r) for r in peers.values()):
        for m in facts['modules']:
            m['lint'].append({'code': 'peer-exact-pin', 'severity': 'warn', 'message': 'Open Mercato peers are pinned to an exact version.', 'anchor': None,
                              'src': {'file': 'package.json', 'line': find_line(os.path.join(pkgroot, 'package.json'), '"@open-mercato/') or 1}})
    core_range = peers.get('@open-mercato/core') or peers.get('@open-mercato/shared')
    if core_range and core_range.startswith('>=0.7.0 <0.8.0'):
        for m in facts['modules']:
            m['lint'].append({'code': 'peer-range-behind', 'severity': 'info', 'message': f'Built for {core_range}, which does not include the latest line 0.9.0.', 'anchor': None, 'src': None})
    if not facts['agentsMd']:
        for m in facts['modules']:
            m['lint'].append({'code': 'no-agents-md', 'severity': 'info', 'message': 'The package ships no AGENTS.md.', 'anchor': None, 'src': None})
    if any('__tests__' in p for p in files_under(os.path.join(pkgroot, 'src'))):
        for m in facts['modules']:
            m['lint'].append({'code': 'ships-tests', 'severity': 'info', 'message': 'The tarball contains __tests__.', 'anchor': None, 'src': None})
    return facts


# ---------------------------------------------------------------- sync

def build_sync(e, idx):
    rec = {'locator': e['locator'], 'checkedAt': T_SYNC, 'firstSeenAt': f'2026-10-23T00:00:{idx:02d}Z', 'npm': None, 'github': None,
           'provenance': {'status': 'none', 'sourceRepo': None, 'commit': None, 'workflow': None}, 'advisories': [],
           'type': e['type'], 'typeReason': e['typeReason'][:200], 'downloads30d': None, 'errors': []}
    if e['npm']:
        pk = packument(e['npm'])
        vers = [v for v in pk['versions'] if is_stable(v) and not pk['versions'][v].get('deprecated')]
        vers.sort(key=vkey)
        latest = vers[-1] if vers else None
        prev = vers[-2] if len(vers) > 1 else None
        preview = None if latest else pk['dist-tags'].get('latest')
        cur = latest or preview
        v = pk['versions'][cur]
        scripts = [s for s in ('preinstall', 'install', 'postinstall', 'prepare') if s in (v.get('scripts') or {})]
        repo = v.get('repository')
        repo_url = repo.get('url') if isinstance(repo, dict) else repo
        rec['npm'] = {
            'name': e['npm'], 'distTags': pk['dist-tags'], 'latestStable': latest, 'previousStable': prev, 'preview': preview,
            'publishedAt': {x: iso(pk['time'][x]) for x in (latest, prev, preview) if x},
            'deprecated': v.get('deprecated'), 'license': v.get('license'), 'repositoryUrl': repo_url, 'gitHead': v.get('gitHead'),
            'keywords': (v.get('keywords') or [])[:30], 'maintainers': [m['name'] for m in v.get('maintainers', [])][:20],
            'peerDependencies': v.get('peerDependencies') or {}, 'dependencies': v.get('dependencies') or {},
            'installScripts': scripts, 'integrity': v['dist'].get('integrity'), 'tarball': v['dist'].get('tarball'),
        }
        rec['downloads30d'] = I4.get(e['npm'], {}).get('downloadsLastMonth')
        if v['dist'].get('attestations'):
            m = re.search(r'github\.com/([^/]+/[^/.]+)', repo_url or '')
            rec['provenance'] = {'status': 'verified', 'sourceRepo': m.group(1) if m else None, 'commit': v.get('gitHead'), 'workflow': None}
        if e['key'] == 'stripe':
            rec['errors'].append('npm: highest stable 1.0.1 is deprecated ("published by mistake, use 0.4.x"); latestStable skips deprecated versions')
    if e['gh']:
        g, tags = ghrepo(e['gh'])
        rec['github'] = {'repo': g['full_name'], 'redirectedFrom': None, 'archived': g['archived'], 'pushedAt': g['pushed_at'],
                         'defaultBranch': g['default_branch'], 'stars': g['stargazers_count'], 'license': (g.get('license') or {}).get('spdx_id'),
                         'topics': (g.get('topics') or [])[:20], 'ownerType': g['owner']['type'],
                         'tags': [{'name': t['name'], 'sha': t['commit']['sha']} for t in tags[:50]] if isinstance(tags, list) else []}
    elif e['key'] in ('durable', 'datasync'):
        rec['errors'].append('github: fullstackhouse/open-mercato-durable from repository.url returns 404 (2026-10-23)')
    return rec


# ---------------------------------------------------------------- fit

def builtfor(range_):
    if not range_:
        return 'missing'
    r = range_.strip()
    if r == '*':
        return 'star'
    if re.fullmatch(r'\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?', r):
        return 'exact-pin'
    if r.startswith('^0.'):
        return 'caret-0x'
    if '<' in r:
        return 'bounded'
    return 'open'


def satisfies(version, range_):
    if not range_:
        return False
    r = range_.strip()
    if re.fullmatch(r'\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?', r):
        return version == r
    if '-' in version:
        return False
    m = re.fullmatch(r'>=(\d+\.\d+\.\d+)\s+<(\d+\.\d+\.\d+)', r)
    if m:
        return vkey(m.group(1)) <= vkey(version) < vkey(m.group(2))
    return False


def g2_cells(e):
    for m in G2['macierz']:
        if m['name'] == e['npm'] and m['ver'] == e['ver']:
            return 'macierz', m
    for m in G2['kontrola_ujemna']:
        if m['name'] == e['npm']:
            return 'kontrola', m
    return None, None


def build_fit():
    out = {}
    for key, omv in LINES:
        cells = {}
        g2key = 'develop' if key == 'next' else omv
        for e in ENTRIES:
            if not e['npm']:
                continue
            src, m = g2_cells(e)
            if not m:
                continue
            facts = json.load(open(os.path.join(G2OUT, e['g2'] + '.json')))
            peers = {k: v for k, v in (facts.get('peerDependencies') or {}).items() if k.startswith('@open-mercato/')}
            rng = peers.get('@open-mercato/core') or peers.get('@open-mercato/shared')
            if src == 'macierz':
                c = m['cells'][g2key]
                status = 'ok' if c['ok'] else 'no-fit'
                checked = c['checked']
                missing = []
                if not c['ok']:
                    mm = re.match(r'brak subpath (.+)$', c['static'])
                    if mm:
                        missing.append({'pkg': '@open-mercato/shared', 'subpath': mm.group(1), 'symbol': None, 'kind': 'subpath'})
                drift = []
                if key == 'next':
                    d = m['drift'].get('0.9.0->develop') or {}
                    drift = (d.get('sample') or [])[:50]
                    if status == 'ok' and d.get('changed'):
                        status = 'drift'
            else:
                c = m[g2key]
                status = 'ok' if c['issues'] == 0 else 'no-fit'
                checked = c['checked']
                missing, drift = [], []
            dup = []
            if e['key'] == 'consents' and key == '0.9':
                dup = [{'name': '@tanstack/react-table', 'moduleRange': '9.2.6', 'appVersion': '9.3.1'}]
            cells[f"{e['locator']}@{e['ver']}"] = {'status': status, 'checked': checked, 'missing': missing, 'drift': drift,
                                                  'declared': {'range': rng, 'kind': builtfor(rng), 'satisfied': satisfies(omv, rng)},
                                                  'hostDuplicates': dup}
        out[omv] = {'om': omv, 'computedAt': T_WATCH, 'cells': cells}
        write_json(f'fit/{omv}.json', out[omv])
    return out


# ---------------------------------------------------------------- receipts

STEPS = ['scaffold', 'install', 'add', 'generate', 'typecheck', 'initialize', 'build', 'start', 'smoke']
API_KEYS = {'id': 'api-keys', 'why': 'OM 0.9.0 empty preset omits api_keys (fixed on main in #7473, not in release/v0.9.x)',
            'ref': 'https://github.com/open-mercato/open-mercato/pull/7473'}
RUN_IDS = {1: 18000000001, 2: 18000000002}


def cell_key(locator, version, integrity, omv, preset='empty'):
    # lib/receipts/cell-key.ts: a preset other than `empty` adds `|preset:<id>`, so the empty keys stay as they were
    s = f"{locator or 'baseline'}@{version or ''}|{integrity or ''}|{omv}|{HARNESS_HASH}|{NODE}"
    if preset != 'empty':
        s += f'|preset:{preset}'
    return hashlib.sha256(s.encode()).hexdigest()


def classic_copies(out):
    """SYNTHETIC (24 Oct): every row again as a receipt of an app from the classic preset, the main verdict since the
    decision of 24 Oct, with the steps and result of the measured empty-preset row (no classic night is measured for
    the fixture yet). The empty rows stay: they are the signal `in isolation`. Baselines first, so module rows link the
    classic baseline of their line."""
    base = {}
    res = {}
    for k in ['_baseline'] + [k for k in out if k != '_baseline']:
        rows = [r for r in out.get(k, []) if r['om'].get('preset', 'empty') == 'empty']
        copies = []
        for r in rows:
            c = json.loads(json.dumps(r))
            m = c['module']
            key = cell_key(m and m['locator'], m and m['version'], m and m['integrity'], c['om']['version'], 'classic')
            c['cellKey'] = key
            c['id'] = f"r_{c['run']['at'][:10].replace('-', '')}_{key[:12]}"
            c['om']['preset'] = 'classic'
            # a new app has integrations and api_keys on: no core requirement to enable, no api-keys patch to apply
            c['requiresInstalled'] = [x for x in c['requiresInstalled'] if not x.startswith('core:')]
            c['harness']['patches'] = [p for p in c['harness']['patches'] if p['id'] != 'api-keys']
            if k == '_baseline':
                base[c['om']['line']] = c['id']
            elif c['baseline'] and c['baseline'].get('receipt'):
                c['baseline']['receipt'] = base.get(c['om']['line'], c['baseline']['receipt'])
            copies.append(c)
        res[k] = rows + copies
    return res


def receipt(line, omv, module, times, result, transition, attempt=1, baseline_ref=None, fail=None, requires=None, also=None):
    key = cell_key(module and module['locator'], module and module['version'], module and module['integrity'], omv)
    steps = []
    failed = False
    for st in STEPS:
        sec = times.get(st, 'skip')
        if st == 'add' and module is None:
            steps.append({'name': st, 'status': 'skipped', 'sec': None, 'signature': None, 'excerpt': None, 'file': None, 'line': None})
            continue
        if fail and st in fail:
            fd = fail[st]
            steps.append({'name': st, 'status': 'fail', 'sec': sec, 'signature': fd['signature'], 'excerpt': fd['excerpt'], 'file': fd.get('file'), 'line': fd.get('line')})
            continue
        if sec == 'skip':
            steps.append({'name': st, 'status': 'skipped', 'sec': None, 'signature': None, 'excerpt': None, 'file': None, 'line': None})
        else:
            steps.append({'name': st, 'status': 'pass', 'sec': sec, 'signature': None, 'excerpt': None, 'file': None, 'line': None})
    run_id = RUN_IDS[attempt]
    durations = sum(s['sec'] or 0 for s in steps)
    return {
        'schema': 1, 'id': f'r_20261023_{key[:12]}', 'cellKey': key, 'module': module,
        'om': {'line': line, 'version': omv, 'createApp': f'create-mercato-app@{omv}', 'preset': 'empty'},
        'harness': {'version': HARNESS_HASH[:12], 'node': NODE, 'yarn': APP_YARN, 'runner': 'ubuntu-latest', 'mode': 'realistic',
                    'patches': [API_KEYS] if omv.startswith('0.9.') else []},
        'baseline': baseline_ref, 'requiresInstalled': requires or [], 'steps': steps,
        'result': result, 'transition': transition,
        'run': {'id': run_id, 'attempt': attempt, 'url': f'https://github.com/wojciechszyjka/modules/actions/runs/{run_id}', 'at': T_NIGHT, 'durationSec': durations},
        'attestation': None,
    }


def sig(step, first_line):
    norm = re.sub(r'[\w./-]+/([\w.-]+)', r'\1', first_line)
    norm = re.sub(r'0x[0-9a-f]+|[0-9a-f]{7,}', 'h', norm)
    norm = re.sub(r'\d+', '#', norm)
    return hashlib.sha1(f'{step}:{norm}'.encode()).hexdigest()


def ok_result():
    return {'status': 'verified', 'failedStep': None, 'alsoFailed': [], 'classification': 'pass', 'quarantineUntil': None}


def build_receipts(facts_by_key):
    integ = {k: (f['package']['integrity'] if f else None) for k, f in facts_by_key.items()}
    out = {}
    # baselines (SP row A times for 0.9 with the api-keys patch; row C times for next)
    t_a = {'scaffold': 6, 'install': 158, 'generate': 9, 'typecheck': 72, 'initialize': 17, 'build': 139, 'start': 9, 'smoke': 11}
    t_c = {'scaffold': 6, 'install': 55, 'generate': 12, 'typecheck': 75, 'initialize': 19, 'build': 146, 'start': 10, 'smoke': 11}
    b09 = receipt('0.9', '0.9.0', None, t_a, ok_result(), {'from': None, 'to': 'verified', 'confirmed': True})
    bnx = receipt('next', NEXT, None, t_c, ok_result(), {'from': None, 'to': 'verified', 'confirmed': True})
    out['_baseline'] = [b09, bnx]
    bref09 = {'status': 'verified', 'receipt': b09['id']}
    brefnx = {'status': 'verified', 'receipt': bnx['id']}

    def mod(k, e):
        return {'locator': e['locator'], 'version': e['ver'], 'integrity': integ[k]}

    E = {e['key']: e for e in ENTRIES}
    # ksef: row A on 0.9 (smoke time from row C), row C on next
    ksef_a = dict(t_a, add=23)
    ksef_c = dict(t_c, add=24)
    out['ksef'] = [
        receipt('0.9', '0.9.0', mod('ksef', E['ksef']), ksef_a, ok_result(), {'from': None, 'to': 'verified', 'confirmed': True}, baseline_ref=bref09, requires=['core:integrations']),
        receipt('next', NEXT, mod('ksef', E['ksef']), ksef_c, ok_result(), {'from': None, 'to': 'verified', 'confirmed': True}, baseline_ref=brefnx, requires=['core:integrations']),
    ]
    # consents: row B1, red typecheck and build, two attempts
    tc_line = "node_modules/@piotrkarwatka/marketing-consents/types/modules/marketing_consents/components/ConsentsTable.tsx(154,13): error TS2321: Excessive stack depth comparing types '{ title: string; titleHeadingLevel: 1; columns: LegacyColumnDef<ConsentRow>[]; data: ConsentRow[]; ...' and 'IntrinsicAttributes & DataTableProps..."
    tc_line2 = "node_modules/@piotrkarwatka/marketing-consents/types/modules/marketing_consents/components/ConsentsTable.tsx(154,89): error TS2322: Type 'LegacyColumnDef<ConsentRow>[]' is not assignable to type 'LegacyColumnDef<ConsentRow, any>[]'."
    fail = {
        'typecheck': {'signature': sig('typecheck', tc_line), 'excerpt': (tc_line + '\n' + tc_line2)[:1200],
                      'file': 'node_modules/@piotrkarwatka/marketing-consents/types/modules/marketing_consents/components/ConsentsTable.tsx', 'line': 154},
        'build': {'signature': sig('typecheck', tc_line), 'excerpt': ('Failed to type check.\n' + tc_line)[:1200],
                  'file': 'node_modules/@piotrkarwatka/marketing-consents/types/modules/marketing_consents/components/ConsentsTable.tsx', 'line': 154},
    }
    cons_t = {'scaffold': 6, 'install': 158, 'add': 23, 'generate': 8, 'typecheck': 72, 'initialize': 16, 'build': 133}
    broken = {'status': 'broken', 'failedStep': 'typecheck', 'alsoFailed': ['build'], 'classification': 'module-fail', 'quarantineUntil': None}
    out['consents'] = [
        receipt('0.9', '0.9.0', mod('consents', E['consents']), cons_t, broken, {'from': None, 'to': 'broken', 'confirmed': False}, attempt=1, baseline_ref=bref09, fail=fail),
        receipt('0.9', '0.9.0', mod('consents', E['consents']), cons_t, broken, {'from': None, 'to': 'broken', 'confirmed': True}, attempt=2, baseline_ref=bref09, fail=fail),
    ]
    # durable-work: row B2 (smoke not timed in the spike: start reached /login 200)
    dur_t = {'scaffold': 6, 'install': 158, 'add': 23, 'generate': 9, 'typecheck': 73, 'initialize': 17, 'build': 149, 'start': 10, 'smoke': None}
    out['durable'] = [receipt('0.9', '0.9.0', mod('durable', E['durable']), dur_t, ok_result(), {'from': None, 'to': 'verified', 'confirmed': True}, baseline_ref=bref09)]
    # gateway-stripe: SYNTHETIC (not measured), needed for the Verified golden case of WP08; times copied from row B2
    out['stripe'] = [receipt('0.9', '0.9.0', mod('stripe', E['stripe']), dict(dur_t), ok_result(), {'from': None, 'to': 'verified', 'confirmed': True}, baseline_ref=bref09)]
    out = classic_copies(out)
    for k, rows in out.items():
        name = '_baseline' if k == '_baseline' else locpath(E[k]['locator'])
        write_jsonl(f'receipts/{name}.jsonl', rows)
    return out


# ---------------------------------------------------------------- built-in

def builtin_facts(mid):
    m = MF[mid]
    meta = (m.get('ownedContracts') or {}).get('module-metadata') or [{}]
    md = meta[0].get('metadata') or {}
    ents = [{'id': x['id'], 'table': x.get('table'), 'src': None} for x in m.get('entities') or []]
    acl = list(m.get('aclFeatures') or [])
    evs = [{'id': x['id'], 'src': None} for x in m.get('events') or []]
    subs = []
    for c in (m.get('extensionSurfaces') or {}).get('contributions') or []:
        if c.get('kind') == 'subscriber':
            ev = (c.get('details') or {}).get('event') or c.get('target')
            if ev and re.fullmatch(r'[a-z0-9_]+(\.[a-z0-9_*-]+){1,5}', ev):
                subs.append({'event': ev, 'src': None})
    pages = []
    for p in m.get('backendPages') or []:
        feats = ((p.get('metadata') or {}).get('requireFeatures') or [])[:10]
        pages.append({'path': p['path'], 'requireFeatures': [f for f in feats if re.fullmatch(r'[a-z0-9_]+(\.[a-z0-9_*-]+){1,5}', f)]})
    fpages = [{'path': p['path']} for p in m.get('frontendPages') or [] if isinstance(p, dict) and p.get('path')]
    cli = [c for c in m.get('cli') or [] if re.fullmatch(r'[a-z0-9:_-]{1,60}', c)]
    contribs = (m.get('extensionSurfaces') or {}).get('contributions') or []
    ext = []
    for c in contribs:
        for t in c.get('targets') or []:
            if not t['id'].startswith(mid):
                ext.append({'kind': c['kind'], 'target': t['id'][:120]})
    counts = dict(D=len(ents), A=0, U=len(pages) + len(fpages), E=len(evs) + len(subs), B=len(cli), I=len(m.get('aiTools') or []) + len(m.get('aiAgents') or []), X=len(ext))
    glyph = ''.join(str(level(counts[k])) for k in 'DAUEBIX')
    req = md.get('requires') or []
    return {
        'id': mid, 'title': (m.get('title') or None) and m['title'][:80], 'description': (m.get('description') or None) and m['description'][:300],
        'requires': [{'raw': r, 'resolvesTo': f'core:{r}' if r in CORE_IDS else None} for r in req], 'ejectable': md.get('ejectable'),
        'data': {'entities': ents, 'migrations': {'count': 0, 'first': None, 'last': None}, 'customEntities': 0},
        'http': {'routes': [], 'legacyRouteFiles': 0, 'authResolved': 0},
        'security': {'aclFeatures': acl, 'setupDefaultRoleFeatures': bool((m.get('ownedContracts') or {}).get('setup'))},
        'events': {'emits': evs, 'subscribes': subs},
        'ui': {'backendPages': pages, 'frontendPages': fpages, 'widgets': 0, 'extensionHosts': len((m.get('extensionSurfaces') or {}).get('hosts') or [])},
        'background': {'workers': [], 'cli': cli},
        'ai': {'tools': [t if isinstance(t, str) else t.get('name', '') for t in m.get('aiTools') or []][:100], 'agents': []},
        'config': {'credentials': [], 'env': []},
        'network': {'hosts': [], 'undeclared': []},
        'extends': ext[:200],
        'omImports': {},
        'collisionKeys': {'moduleId': mid, 'tables': [e['table'] for e in ents if e['table']], 'aclFeatures': acl, 'eventIds': [e['id'] for e in evs], 'backendRoutes': [p['path'] for p in pages]},
        'publicRoutes': 0,
        'glyph': glyph,
        'lint': [],
    }


def build_builtin():
    doc = {'factsVersion': 1, 'coreVersion': '0.9.0',
           'extractor': {'engine': '@open-mercato/cli@0.9.0', 'factsContractVersion': 2, 'source': 'module-facts.v2.json', 'cliVersion': '0.9.0'},
           'computedAt': T_WATCH, 'routesMeasured': False, 'modules': [builtin_facts(m) for m in BUILTINS],
           'diagnostics': [f'fixture: 3 of {len(CORE_IDS)} core modules (currencies, data_sync, wms); migrations and widgets are not in module-facts.v2.json']}
    write_json('builtin/0.9.0.json', doc)
    return doc


# ---------------------------------------------------------------- lines, presets, hive, claims, stats

def cma_empty(version):
    js = open(os.path.join(S, 'tgz', f'x-cma-{version}', 'package/dist/index.js')).read()
    body = re.search(r'EMPTY_MODULES\s*=\s*\[(.*?)\];', js, re.S).group(1)
    consts = dict(re.findall(r'(?:var|const)\s+([A-Z_]+)\s*=\s*"(@open-mercato/[a-z-]+)"', js))
    return [{'id': i, 'from': consts.get(f, f.strip('"'))} for i, f in re.findall(r'id:\s*"([a-z_]+)",\s*from:\s*([A-Z_]+|"[^"]+")', body)]


def build_lines():
    lines = {'resolvedAt': T_WATCH, 'coreLatest': '0.9.0', 'keepaliveAt': None, 'lines': [
        {'key': '0.9', 'version': '0.9.0', 'source': 'latest', 'createApp': 'create-mercato-app@0.9.0', 'cadence': 'nightly', 'preapproved': ['@open-mercato/*']},
        {'key': '0.8', 'version': '0.8.0', 'source': 'previous', 'createApp': 'create-mercato-app@0.8.0', 'cadence': 'weekly', 'preapproved': ['@open-mercato/*']},
        {'key': 'next', 'version': NEXT, 'source': 'develop', 'createApp': f'create-mercato-app@{NEXT}', 'cadence': 'nightly', 'preapproved': ['@open-mercato/*']},
    ]}
    write_json('lines.json', lines)
    presets = {k: {'omVersion': v, 'empty': cma_empty(v), 'at': T_COLLECT} for k, v in LINES}
    write_json('presets.json', presets)
    write_json('hive.json', {'version': 1, 'slots': {}})
    write_json('claims.json', {})
    stats = {'at': T_SYNC, 'entries': {}}
    for e in ENTRIES:
        g, _ = ghrepo(e['gh'])
        stars = g['stargazers_count'] if g and e['type'] != 'official' else None
        stats['entries'][e['locator']] = {'downloads30d': I4.get(e['npm'] or '', {}).get('downloadsLastMonth'), 'stars': stars}
    write_json('stats.json', stats)
    return lines, presets


# ---------------------------------------------------------------- health

def nonzero_organs(glyph):
    return sum(1 for c in glyph if c != '0')


def build_health(e, sync, facts, fit, receipts):
    loc = e['locator']
    cur = e['ver']
    rcp = {}
    for line, omv in LINES:
        rows = [r for r in receipts.get(e['key'], []) if r['om']['line'] == line and r['om'].get('preset') == 'classic']
        if e.get('enterprise'):
            rcp[line] = 'skipped'
        elif rows:
            rcp[line] = rows[-1]['result']['status']
        else:
            rcp[line] = 'untested'
    if e['key'] == 'tpay':
        rcp['0.8'] = 'skipped'
        rcp['0.9'] = 'skipped'
    fits = {}
    for line, omv in LINES:
        c = fit[omv]['cells'].get(f'{loc}@{cur}') if cur else None
        fits[line] = c['status'] if c else 'unknown'
    if facts is None:
        anatomy = 'none'
    elif e.get('enterprise'):
        anatomy = 'hidden'
    else:
        ar = facts['coverage']['routesAuthResolved']
        organs = max(nonzero_organs(m['glyph']) for m in facts['modules'])
        anatomy = 'full' if ar >= 0.9 and organs >= 3 else 'partial'
    scripts = (sync['npm'] or {}).get('installScripts') or []
    supply = {'status': 'fail' if scripts else 'ok', 'reasons': [f'Undeclared install scripts: {", ".join(scripts)}.'] if scripts else []}
    lint = [l for m in (facts['modules'] if facts else []) for l in m['lint']]
    errors = sorted({l['code'] for l in lint if l['severity'] == 'error'})
    warns = sorted({l['code'] for l in lint if l['severity'] == 'warn'})
    hygiene = {'status': 'fail' if errors else 'warn' if warns else 'ok', 'failing': (errors + warns)[:30]}
    npm = sync['npm']
    last = None
    if npm:
        v = npm['latestStable'] or npm['preview']
        last = npm['publishedAt'][v][:10]
    elif sync['github']:
        last = sync['github']['pushedAt'][:10]
    verified_lines = [l for l, s in rcp.items() if s == 'verified']
    maint = {'status': 'current', 'lastRelease': last, 'catchUpDays': None}
    rng = None
    if facts:
        rng = facts['omPeers'].get('@open-mercato/core') or facts['omPeers'].get('@open-mercato/shared')
    built_for_lines = [l for l, v in LINES if rng and satisfies(v, rng)]
    dvo_notes = []
    if set(built_for_lines) != set(verified_lines) and (verified_lines or built_for_lines):
        dvo_notes.append(f'Built for {", ".join(built_for_lines) or "no tested line"}; verified on {", ".join(verified_lines) or "no line"}.')
    signals = {'receipt': rcp, 'fit': fits, 'anatomy': anatomy, 'supplyChain': supply, 'hygiene': hygiene, 'maintenance': maint,
               'declaredVsObserved': {'status': 'mismatch' if dvo_notes else 'match', 'notes': dvo_notes}}
    lic = facts['license'] if facts else {'value': (sync['github'] or {}).get('license'), 'kind': 'osi' if (sync['github'] or {}).get('license') else 'unknown', 'mismatch': False}
    official = e['type'] == 'official'
    hold = False
    # rules
    rules = [
        {'id': 'LST-1', 'pass': True, 'detail': 'Descriptor is valid.'},
        {'id': 'LST-2', 'pass': True, 'detail': ('Preview only; allowed for official packages.' if (npm and not npm['latestStable']) else
                                              'Stable version exists and is not deprecated.' if npm else 'GitHub repository exists; no tag yet.')},
        {'id': 'LST-3', 'pass': facts is None or facts['gate']['installable'], 'detail': 'src/modules and dist/modules pair found.' if facts else 'Kind not confirmed: no tag to read.'},
        {'id': 'LST-4', 'pass': True, 'detail': f"License: {lic['value'] or 'unknown'}."},
        {'id': 'LST-5', 'pass': True, 'detail': 'No known malware or open critical advisory.'},
        {'id': 'LST-6', 'pass': True, 'detail': 'Name reviewed at merge.'},
    ]
    if e['key'] == 'treg':
        rules[2]['pass'] = True
        rules[2]['detail'] = 'Kind module from the repository tree; not confirmed by a tagged archive.'
    listed = all(r['pass'] for r in rules)
    rec = rcp.get('0.9')
    ver1 = rec == 'verified'
    ver2 = fits.get('0.9') in ('ok', 'drift')
    ver3 = supply['status'] == 'ok'
    ver4 = not errors
    ver5 = True
    rules += [
        {'id': 'VER-1', 'pass': ver1, 'detail': f'Receipt on 0.9: {rec}.'},
        {'id': 'VER-2', 'pass': ver2, 'detail': f"Fits statically on 0.9: {fits.get('0.9')}."},
        {'id': 'VER-3', 'pass': ver3, 'detail': f"Supply chain: {supply['status']}."},
        {'id': 'VER-4', 'pass': ver4, 'detail': 'No lint errors.' if ver4 else f'Lint errors: {", ".join(errors)}.'},
        {'id': 'VER-5', 'pass': ver5, 'detail': 'Tarball repository.url matches the descriptor.' if e['github'] and npm else 'No GitHub field to compare.'},
    ]
    if e.get('enterprise'):
        tier = None
    elif not listed or hold:
        tier = None
    elif all([ver1, ver2, ver3, ver4, ver5]):
        tier = 'verified'
    else:
        tier = 'listed'
    # agent policy per line (spec 6.5)
    policy = {}
    for line, omv in LINES:
        refuse, ask = [], []
        st = rcp[line]
        if st == 'broken':
            refuse.append({'code': 'BROKEN', 'text': f'Fails at typecheck on {line} since 23 Oct.'})
        if e['key'] == 'treg':
            refuse.append({'code': 'UNPINNED_GIT', 'text': 'GitHub source without a pinned tag.'})
        if not official:
            ask.append({'code': 'THIRD_PARTY', 'text': "Third-party code runs with access to all tenants' data."})
        if st != 'verified' and st != 'broken':
            ask.append({'code': 'NOT_VERIFIED', 'text': f'Not installed on {line} by the catalog yet.'})
        if lic['kind'] in ('proprietary', 'enterprise', 'unknown'):
            ask.append({'code': 'LICENSE', 'text': f"License: {lic['kind']} ({lic['value']})." if lic['value'] else f"License: {lic['kind']}."})
        if e.get('replaces'):
            ask.append({'code': 'REPLACES', 'text': 'Replaces core data_sync. Remove the core registration first.'})
        if supply['status'] != 'ok':
            ask.append({'code': 'SUPPLY_CHAIN', 'text': 'Declares install scripts.'})
        if refuse:
            policy[line] = {'decision': 'refuse', 'reasons': (refuse + ask)[:10]}
        elif ask:
            ver = cur if npm and npm['latestStable'] == cur else (npm['preview'] if npm else None)
            p = {'decision': 'ask', 'reasons': ask[:10]}
            if npm and ver:
                p['consentText'] = f"Install {e['npm']}@{ver}"
            policy[line] = p
        else:
            policy[line] = {'decision': 'allow', 'reasons': [{'code': 'OFFICIAL_VERIFIED', 'text': f'Official, verified on {line}.'}]}
    claimed = {'value': False, 'by': None, 'method': None, 'pr': None}
    prov = sync['provenance']
    health = {
        'locator': loc, 'version': cur, 'computedAt': T_COLLECT,
        'identity': {'type': e['type'], 'typeReason': e['typeReason'], 'enterprise': bool(e.get('enterprise')),
                     'license': {'spdx': lic['value'] if lic['kind'] == 'osi' else None, 'kind': lic['kind'], 'mismatch': lic['mismatch']},
                     'builtFrom': {'status': prov['status'], 'repo': prov['sourceRepo'], 'commit': prov['commit'], 'workflow': prov['workflow']},
                     'claimed': claimed, 'source': 'npm' if npm else 'github'},
        'signals': signals, 'rules': rules, 'tier': tier, 'quality': None, 'agentPolicy': policy, 'state': 'active',
    }
    write_json(f'health/{locpath(loc)}.json', health)
    return health


# ---------------------------------------------------------------- radar, changes

def build_radar():
    changed = {}
    for m in G2['macierz']:
        loc = 'npm:' + m['name']
        if not any(e['locator'] == loc for e in ENTRIES):
            continue
        for sym in (m['drift'].get('0.9.0->develop') or {}).get('sample') or []:
            changed.setdefault(sym, []).append(loc)
    radar = {
        'schemaVersion': 1, 'generatedAt': T_COLLECT, 'next': NEXT, 'base': '0.9.0',
        'summary': f'{NEXT} changes {len(changed)} APIs used by fixture modules. createRequestContainer is used by 15 of 16 packages outside the org.',
        'changedApis': [{'symbol': s, 'change': 'signature', 'modules': sorted(mods)} for s, mods in sorted(changed.items())],
        'staticBreaks': [], 'receiptsOnNext': {'verified': 1, 'broken': 0}, 'sameFailure': [],
        'loadBearing': [{'symbol': '@open-mercato/shared/lib/di/container#createRequestContainer', 'modules': 15, 'of': 16}],
    }
    write_json('radar/next.json', radar)


def build_changes(syncs, receipts, healths):
    rows = []
    for e in ENTRIES:
        rows.append({'at': syncs[e['key']]['firstSeenAt'], 'type': 'new-entry', 'locator': e['locator']})
    for k, rs in receipts.items():
        if k == '_baseline':
            continue
        e = next(x for x in ENTRIES if x['key'] == k)
        for r in rs:
            # one change per measured row: the classic copies (classic_copies) repeat the same transitions
            if r['transition']['confirmed'] and r['om'].get('preset', 'empty') == 'empty':
                rows.append({'at': r['run']['at'], 'type': 'receipt-transition', 'locator': e['locator'], 'line': r['om']['line'],
                             'from': 'untested', 'to': r['transition']['to'], 'version': r['module']['version']})
    for k, h in healths.items():
        if h['tier'] == 'verified':
            rows.append({'at': T_COLLECT, 'type': 'tier-change', 'locator': h['locator'], 'line': '0.9', 'from': 'listed', 'to': 'verified', 'version': h['version']})
    rows.sort(key=lambda r: (r['at'], r['locator'], r['type']))
    write_jsonl('changes/2026-10.jsonl', rows)


def add_classic():
    """`--add-classic`: the classic copies of build_receipts on the receipts of the existing snapshot."""
    E = {locpath(e['locator']): e for e in ENTRIES}
    out = {}
    root = os.path.join(OUT, 'receipts')
    for dirpath, _, names in os.walk(root):
        for n in names:
            if not n.endswith('.jsonl'):
                continue
            rel = os.path.relpath(os.path.join(dirpath, n), root)[: -len('.jsonl')]
            key = '_baseline' if rel == '_baseline' else E[rel]['key']
            out[key] = [json.loads(l) for l in open(os.path.join(dirpath, n)) if l.strip()]
    out = classic_copies(out)
    for k, rows in out.items():
        name = '_baseline' if k == '_baseline' else locpath(next(e for e in ENTRIES if e['key'] == k)['locator'])
        write_jsonl(f'receipts/{name}.jsonl', rows)


def main():
    if ADD_CLASSIC:
        add_classic()
        return
    if os.path.isdir(OUT):
        import shutil
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    facts_by_key, syncs = {}, {}
    for idx, e in enumerate(ENTRIES, 1):
        syncs[e['key']] = build_sync(e, idx)
        write_json(f"sync/{locpath(e['locator'])}.json", syncs[e['key']])
        if e['g2']:
            facts_by_key[e['key']] = build_facts(e)
            write_json(f"facts/{locpath(e['locator'])}/{e['ver']}.json", facts_by_key[e['key']])
        else:
            facts_by_key[e['key']] = None
    fit = build_fit()
    receipts = build_receipts(facts_by_key)
    build_builtin()
    build_lines()
    healths = {e['key']: build_health(e, syncs[e['key']], facts_by_key[e['key']], fit, receipts) for e in ENTRIES}
    build_radar()
    build_changes(syncs, receipts, healths)
    for k, h in healths.items():
        print(k, h['tier'], {l: p['decision'] + ':' + ','.join(r['code'] for r in p['reasons']) for l, p in h['agentPolicy'].items()}, h['signals']['receipt'], h['signals']['fit'], h['signals']['anatomy'])


main()
