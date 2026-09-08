#!/usr/bin/env python3
"""Validate the deployable static site's crawl paths, metadata, and local assets."""
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://duetcalendar.com'
errors = []

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path, self.nodes, self.ids, self.schemas = path, [], [], []
        self.title = ''
        self.in_title = False
        self.in_json = False
        self.json_text = ''
        self.feed(path.read_text())
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.nodes.append((tag, attrs))
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag == 'title':
            self.in_title = True
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.in_json = True
            self.json_text = ''
    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.in_json:
            self.json_text += data
    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag == 'script' and self.in_json:
            try:
                self.schemas.append(json.loads(self.json_text))
            except json.JSONDecodeError as error:
                errors.append(f'{self.path.relative_to(ROOT)}: invalid JSON-LD: {error}')
            self.in_json = False
    def find(self, tag, **attrs):
        return [a for t, a in self.nodes if t == tag and all(a.get(k) == v for k, v in attrs.items())]

def require(condition, message):
    if not condition:
        errors.append(message)

def local_file(url):
    path = ROOT / unquote(urlparse(url).path).lstrip('/')
    return path / 'index.html' if path.is_dir() else path

sitemap = ET.parse(ROOT / 'sitemap.xml')
ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
urls = [n.text for n in sitemap.findall('s:url/s:loc', ns)]
require(len(urls) == len(set(urls)), 'Duplicate sitemap URLs')
require(ORIGIN + '/app/' not in urls, 'App redirect must not be indexed')
pages = {}
for url in urls:
    require(url.startswith(ORIGIN + '/') and url.endswith('/'), f'Noncanonical sitemap URL: {url}')
    path = local_file(url)
    require(path.exists(), f'Missing sitemap target: {url}')
    if path.exists():
        pages[url] = Page(path)

titles, descriptions = [], []
for url, page in pages.items():
    label = str(page.path.relative_to(ROOT))
    titles.append(page.title)
    require(bool(page.title.strip()), f'{label}: missing title')
    desc = page.find('meta', name='description')
    require(len(desc) == 1 and bool(desc[0].get('content')), f'{label}: missing/duplicate description')
    if desc:
        descriptions.append(desc[0].get('content'))
    require(len(page.find('h1')) == 1, f'{label}: expected one h1')
    require(len(page.ids) == len(set(page.ids)), f'{label}: duplicate element IDs')
    canonicals = page.find('link', rel='canonical')
    require(len(canonicals) == 1 and canonicals[0].get('href') == url, f'{label}: wrong canonical')
    require(not any('noindex' in a.get('content', '') for a in page.find('meta', name='robots')), f'{label}: indexed page has noindex')
    if not url.endswith('/privacy/'):
        for prop in ['og:title', 'og:description', 'og:type', 'og:url', 'og:image']:
            found = page.find('meta', property=prop)
            require(len(found) == 1, f'{label}: missing/duplicate {prop}')
            if found and prop in ('og:url', 'og:image'):
                require(found[0]['content'].startswith(ORIGIN + '/'), f'{label}: {prop} must be absolute')
        require(bool(page.schemas), f'{label}: missing structured data')
    for tag, attrs in page.nodes:
        if tag == 'img':
            require('alt' in attrs, f'{label}: image missing alt')
            require(bool(attrs.get('width')) and bool(attrs.get('height')), f'{label}: image missing dimensions')
        refs = []
        if tag in ('a', 'link') and attrs.get('href'):
            refs.append(attrs['href'])
        if tag in ('img', 'script') and attrs.get('src'):
            refs.append(attrs['src'])
        if tag == 'meta' and attrs.get('property') == 'og:image':
            refs.append(attrs.get('content', ''))
        if tag == 'img' and attrs.get('srcset'):
            refs.extend(part.strip().split()[0] for part in attrs['srcset'].split(','))
        for ref in refs:
            target = urljoin(url, ref)
            parsed = urlparse(target)
            if parsed.netloc != 'duetcalendar.com' or parsed.scheme not in ('http', 'https'):
                continue
            dest = local_file(target)
            require(dest.is_file(), f'{label}: broken internal reference {ref}')
            if parsed.fragment and dest.is_file() and dest.suffix == '.html':
                target_url = target.split('#')[0].split('?')[0]
                target_page = pages.get(target_url) or Page(dest)
                require(unquote(parsed.fragment) in target_page.ids, f'{label}: broken anchor {ref}')
require(len(titles) == len(set(titles)), 'Duplicate page titles')
require(len(descriptions) == len(set(descriptions)), 'Duplicate descriptions')
require('Sitemap: ' + ORIGIN + '/sitemap.xml' in (ROOT / 'robots.txt').read_text(), 'robots.txt missing sitemap')
redirect = Page(ROOT / 'app/index.html')
require(any('noindex' in m.get('content', '') for m in redirect.find('meta', name='robots')), '/app needs noindex')
# The shipped-version copy must remain consistent across visible text and search metadata.
for slug in ['', 'co-parenting-expenses/', 'parenting-schedule-swaps/', 'ai-family-calendar/', 'shared-family-calendar/']:
    source = (ROOT / slug / 'index.html').read_text()
    require(not re.search(r'coming in|not yet available|1\.18 preview|expense preview', source, re.I), f'{slug}: stale release-preview copy')
    require('1.17' not in source, f'{slug}: stale 1.17 reference')
# Ensure the new content is discoverable through ordinary links, without JavaScript.
linked = {urljoin(url, a['href']).split('#')[0] for url, page in pages.items() for a in page.find('a') if a.get('href')}
for url in urls:
    require(url in linked, f'Orphaned sitemap page: {url}')
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'PASS: {len(pages)} indexed pages; unique metadata; canonical URLs; JSON-LD; internal links, anchors, images, and sitemap; release copy; /app noindex.')
