#!/usr/bin/env python3
"""Builds test/core/fixtures/corpus.json: a search and plan corpus for the 59 entries of spec 11.1 and the 46
built-in modules of @open-mercato/core 0.9.0, from real, read-only sources (nothing executed):

- entries 11.1 (locator, kind, type, category, status, providers, replaces, renamedFrom): the spec table;
- summaries: the 8 fixture descriptors (test/fixtures/descriptors/valid), else the npm `description` of the
  latest version (registry.npmjs.org/<name>/latest, saved under --npm), else the module description from the g2
  static scan (~/kod/katalog-src/spikes/g2/out), else a short text written from the package AGENTS.md;
- tags: npm keywords (descriptor tag pattern, max 8);
- anatomy ids and requires: the g2 scan (extractModuleFacts of @open-mercato/cli 0.9.0);
- built-in: dist/agentic/guides/module-facts.v2.json of @open-mercato/cli 0.9.0 (node_modules), categories of spec 4.4,
  requires from the g2 scan of @open-mercato/core 0.9.0.

Usage: python3 test/core/fixtures/build-corpus.py --npm <dir with <name>.json manifests> [--g2 <dir>]
WP03 writes the real descriptors; the orchestrator reruns the golden queries on them.
"""
import argparse, json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
P = argparse.ArgumentParser()
P.add_argument('--npm', required=True)
P.add_argument('--g2', default=os.path.expanduser('~/kod/katalog-src/spikes/g2/out'))
A = P.parse_args()

def yaml_load(path):
    import subprocess
    out = subprocess.run(['node', '-e', "const y=require('yaml');process.stdout.write(JSON.stringify(y.parse(require('fs').readFileSync(process.argv[1],'utf8'))))", path], capture_output=True, text=True, cwd=ROOT)
    return json.loads(out.stdout)

# spec 11.1: locator, kind, type, category, extra
E = []
def add(loc, kind, typ, cat, **kw): E.append(dict(locator=loc, kind=kind, type=typ, category=cat, **kw))
add('npm:@open-mercato/ai-assistant', 'module', 'official', 'ai-automation')
for c in ['apns', 'discord', 'expo', 'fcm', 'gmail', 'imap', 'resend', 'ses']:
    add(f'npm:@open-mercato/channel-{c}', 'module', 'official', 'communication')
add('npm:@open-mercato/checkout', 'module', 'official', 'orders-checkout')
add('npm:@open-mercato/content', 'module', 'official', 'content-portal')
add('npm:@open-mercato/documents', 'module', 'official', 'content-portal')
add('npm:@open-mercato/enterprise', 'module', 'official', 'auth-security', enterprise=True)
add('npm:@open-mercato/events', 'module', 'official', 'storage-infrastructure')
add('npm:@open-mercato/gateway-stripe', 'module', 'official', 'payments-finance', providers=[{'name': 'stripe', 'label': 'Stripe'}])
add('npm:@open-mercato/gateway-tpay', 'module', 'official', 'payments-finance', providers=[{'name': 'tpay', 'label': 'Tpay'}])
add('npm:@open-mercato/onboarding', 'module', 'official', 'content-portal')
add('npm:@open-mercato/scheduler', 'module', 'official', 'storage-infrastructure')
add('npm:@open-mercato/search', 'module', 'official', 'search-analytics')
add('npm:@open-mercato/storage-s3', 'module', 'official', 'storage-infrastructure')
add('npm:@open-mercato/sync-akeneo', 'module', 'official', 'integrations-sync', providers=[{'name': 'akeneo', 'label': 'Akeneo'}])
add('npm:@open-mercato/telemetry', 'module', 'official', 'storage-infrastructure')
add('npm:@open-mercato/tillio', 'module', 'official', 'communication')
add('npm:@open-mercato/webhooks', 'module', 'official', 'integrations-sync')
add('npm:@open-mercato/web-research', 'library', 'official', 'ai-automation')
for p in ['browser', 'exa', 'firecrawl', 'model', 'searxng', 'serp', 'tavily']:
    add(f'npm:@open-mercato/web-research-{p}', 'provider', 'official', 'ai-automation', providers=[{'name': p, 'label': p.capitalize()}], extends='npm:@open-mercato/web-research')
add('npm:@piotrkarwatka/marketing-consents', 'module', 'community', 'marketing-loyalty')
add('npm:@piotrkarwatka/visits', 'module', 'community', 'crm-sales', tags=['example'])
add('npm:@fastwhitecat/integration-ksef-direct', 'module', '3rd-party', 'localization-compliance')
add('npm:@freighttech/shipment-tracking', 'module', '3rd-party', 'warehouse-shipping')
add('npm:@freighttech/terminal-tracking', 'module', '3rd-party', 'warehouse-shipping')
add('npm:@fullstackhouse/open-mercato-health', 'module', '3rd-party', 'storage-infrastructure')
add('npm:@fullstackhouse/open-mercato-durable-work', 'module', '3rd-party', 'storage-infrastructure')
add('npm:@fullstackhouse/open-mercato-data-sync-durable', 'module', '3rd-party', 'integrations-sync', replaces=['core:data_sync'])
add('npm:@northbound-run/sync-shopify', 'module', '3rd-party', 'integrations-sync', providers=[{'name': 'shopify', 'label': 'Shopify'}])
add('npm:@northbound-run/sync-google-sheets', 'module', '3rd-party', 'integrations-sync')
add('npm:@northbound-run/channel-cloudflare-email', 'module', '3rd-party', 'communication')
add('npm:@northbound-run/search-cloudflare', 'module', '3rd-party', 'search-analytics')
add('npm:@dainamite/cpq', 'module', '3rd-party', 'catalog-pricing')
add('npm:@dainamite/billing', 'module', '3rd-party', 'payments-finance')
add('npm:@dainamite/cpq-billing-connector', 'module', '3rd-party', 'payments-finance')
add('github:Chmarusso/open-mercato-enrichment-treg', 'module', '3rd-party', 'crm-sales')
add('github:fullstackhouse/open-mercato-client-auth', 'module', '3rd-party', 'auth-security')
add('npm:@freighttech/ui', 'library', '3rd-party', 'devtools')
add('npm:@fullstackhouse/open-mercato-demo-auth', 'tool', '3rd-party', 'devtools')
add('npm:create-mercato-module', 'tool', 'official', 'devtools')
add('npm:mercato-readiness-scanner', 'tool', 'official', 'devtools', renamedFrom=['npm:@open-mercato/readiness-scanner'])
add('npm:open-mercato-generator', 'tool', '3rd-party', 'devtools')
add('npm:@open-mercato/forms', 'module', 'official', 'content-portal', status='hold', supersededBy='core:forms')
add('npm:@open-mercato/carrier-inpost', 'module', 'official', 'warehouse-shipping', status='hold')
for p in ['gateway-payu', 'gateway-przelewy24', 'pay-by-links']:
    add(f'npm:@open-mercato/{p}', 'module', 'official', 'payments-finance', status='hold')
assert len(E) == 59, len(E)

# hand-written from the package AGENTS.md where npm, the scan and the fixture have no text
HAND = {
    'npm:@open-mercato/web-research': 'Adapter-based web search and read engine for AI agents, with one package per search source.',
}

def clean(s, limit=140):
    s = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', s or '')
    s = re.sub(r'https?://\S+', '', s)
    s = s.replace('`', '').replace('**', '').replace('—', ',').replace('–', '-').replace('→', 'to').replace('↔', 'and')
    s = re.sub(r'[<>\[\]#*]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    if len(s) > limit:
        cut = s[:limit - 1]
        s = cut[:cut.rfind(' ')].rstrip(',;:(') + '.'
    return s

def g2_for(name):
    slug = name.replace('@', '').replace('/', '-')
    for f in sorted(os.listdir(A.g2)):
        if f.startswith(slug + '-') and f.endswith('.json') and re.match(re.escape(slug) + r'-\d', f):
            return json.load(open(os.path.join(A.g2, f)))
    return None

desc_dir = os.path.join(ROOT, 'test', 'fixtures', 'descriptors', 'valid', 'modules')
core = json.load(open(os.path.join(ROOT, 'node_modules', '@open-mercato', 'cli', 'dist', 'agentic', 'guides', 'module-facts.v2.json')))
core_ids = sorted(k for k, v in core.items() if v.get('sourcePackage') == '@open-mercato/core')

IDENT = re.compile(r'^[a-z0-9_]+(\.[a-z0-9_*-]+){1,5}$')  # AclFeature / EventId (spec 4.1); others are dropped like Rentgen does

out = []
for e in E:
    loc = e['locator']
    name = loc[4:] if loc.startswith('npm:') else loc[7:]
    path = name if loc.startswith('npm:') else 'github/' + name.lower()
    d = None
    f = os.path.join(desc_dir, path + '.yml')
    if os.path.exists(f):
        d = yaml_load(f)
    manifest = {}
    mf = os.path.join(A.npm, name.replace('/', '_').replace('@', '_') + '.json')
    if loc.startswith('npm:') and os.path.exists(mf):
        manifest = json.load(open(mf))
    g2 = g2_for(name) if loc.startswith('npm:') else None
    facts = list(((g2 or {}).get('facts') or {}).items())
    facts = [(k, v) for k, v in facts if isinstance(v, dict) and k != 'widgets']
    mod_title = facts[0][1].get('title') if len(facts) == 1 else None
    mod_desc = facts[0][1].get('description') if len(facts) == 1 else None
    summary = (d or {}).get('summary') or HAND.get(loc) or clean(manifest.get('description')) or clean(mod_desc) or ''
    if not summary:
        base = mod_title or name.split('/')[-1].replace('-', ' ')
        summary = f'{base} for Open Mercato apps.'
    title = mod_title or ' '.join(w.capitalize() for w in re.sub(r'^open-?mercato-', '', name.split('/')[-1]).split('-'))
    when = (d or {}).get('whenToUse') or f'Use when the app needs {title}.'
    tags = (d or {}).get('tags') or [k for k in (manifest.get('keywords') or []) if re.fullmatch(r'[a-z0-9-]{2,24}', k) and k not in ('open-mercato', 'open-mercato-module', 'mercato')][:8]
    tags = list(dict.fromkeys((e.get('tags') or []) + tags))[:8]
    ids = [k for k, _ in facts]
    req, tables, emits, acl = [], [], [], []
    for k, v in facts:
        for r in v.get('requires') or []:
            if r not in [x['raw'] for x in req] and r not in ids:
                req.append({'raw': r, 'resolvesTo': f'core:{r}' if r in core_ids else None})
        tables += [x.split(':', 1)[-1] for x in v.get('entityIds') or []]
        emits += [x for x in v.get('eventIds') or [] if IDENT.match(x)]
        acl += [x for x in v.get('aclIds') or [] if IDENT.match(x)]
    lic = manifest.get('license') if loc.startswith('npm:') else 'MIT'
    if e.get('enterprise'):
        lk, spdx = 'enterprise', None
    elif lic in ('UNLICENSED',):
        lk, spdx = 'proprietary', None
    elif lic:
        lk, spdx = 'osi', lic
    else:
        lk, spdx = 'unknown', None
    out.append({
        'locator': loc, 'path': path, 'npm': name if loc.startswith('npm:') else None,
        'kind': e['kind'], 'type': e['type'], 'category': e['category'], 'status': e.get('status', 'active'),
        'title': title[:80], 'summary': summary, 'whenToUse': when,
        'tags': tags, 'providers': (d or {}).get('providers') or e.get('providers', []),
        'renamedFrom': (d or {}).get('renamedFrom') or e.get('renamedFrom', []),
        'replaces': (d or {}).get('replaces') or e.get('replaces', []),
        'supersededBy': e.get('supersededBy'),
        'moduleIds': ids, 'requires': req,
        'license': {'spdx': spdx, 'kind': lk},
        'version': manifest.get('version'),
        'anatomy': None if e.get('enterprise') else {'tables': sorted(set(tables))[:20], 'eventsEmitted': list(dict.fromkeys(emits))[:20], 'aclFeatures': list(dict.fromkeys(acl))[:20]},
    })

CAT = dict(api_docs='devtools', api_keys='auth-security', attachments='storage-infrastructure', audit_logs='auth-security', auth='auth-security', availability='operations', business_rules='ai-automation', catalog='catalog-pricing', communication_channels='communication', configs='storage-infrastructure', currencies='payments-finance', customer_accounts='content-portal', customer_groups='crm-sales', customers='crm-sales', dashboards='search-analytics', data_sync='integrations-sync', design_system='devtools', devices='communication', dictionaries='storage-infrastructure', directory='auth-security', ecommerce='orders-checkout', entities='storage-infrastructure', eudr='localization-compliance', feature_toggles='devtools', forms='content-portal', inbox_ops='ai-automation', integrations='integrations-sync', messages='communication', notifications='communication', payment_gateways='payments-finance', perspectives='search-analytics', phone_calls='communication', planner='operations', portal='content-portal', progress='storage-infrastructure', push_notifications='communication', query_index='search-analytics', resources='operations', sales='orders-checkout', seeds='devtools', shipping_carriers='warehouse-shipping', staff='operations', sync_excel='integrations-sync', translations='localization-compliance', warranty_claims='operations', wms='warehouse-shipping', workflows='ai-automation')
core_g2 = (g2_for('@open-mercato/core') or {}).get('facts') or {}
built = []
for k in core_ids:
    v = core[k]
    built.append({
        'id': k, 'title': v.get('title') or k, 'description': clean(v.get('description') or '', 300),
        'category': CAT.get(k, 'operations'),
        'tables': sorted({x.get('table') for x in v.get('entities') or [] if x.get('table')})[:20],
        'eventsEmitted': [x['id'] for x in v.get('events') or [] if IDENT.match(x['id'])][:20],
        'aclFeatures': [x for x in v.get('aclFeatures') or [] if IDENT.match(x)][:20],
        'requires': list((core_g2.get(k) or {}).get('requires') or []),  # module-facts.v2.json has no requires; g2 scan of core 0.9.0
    })
assert len(built) == 46, len(built)
json.dump({'note': 'Generated by build-corpus.py; see the docstring for sources. Not a golden file.', 'entries': out, 'builtIn': built},
          open(os.path.join(os.path.dirname(__file__), 'corpus.json'), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'entries,', len(built), 'built-in')
