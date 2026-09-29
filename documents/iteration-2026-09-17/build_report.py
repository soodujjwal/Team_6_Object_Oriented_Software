"""Build portable report formats from reviewed prose and captured evidence (stdlib only)."""
from pathlib import Path
import html
import json
import re
import zipfile
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parent


def evidence(name):
    return json.loads((ROOT / 'evidence' / name).read_text(encoding='utf-8'))


def table(headers, rows):
    def row(values):
        return '| ' + ' | '.join(str(v).replace('|', '/') for v in values) + ' |'
    return '\n'.join([row(headers), row(['---'] * len(headers)), *map(row, rows)]) + '\n\n'


def assemble():
    snapshot = evidence('snapshot.json')
    parts = [(ROOT / 'Report_Source.md').read_text(encoding='utf-8')]
    parts += ['\n## Appendix A. Captured environment\n\n', table(['Property', 'Value'], [
        ('Captured UTC', snapshot['captured_utc']), ('Git commit', snapshot['head']),
        ('Branch', snapshot['branch']), ('Python', snapshot['python']),
        *snapshot['packages'].items()])]
    parts += ['## Appendix B. Complete declared API inventory\n\n',
              'Paths below are application endpoints; FastAPI-generated documentation routes are excluded. Authentication does not imply per-user financial isolation.\n\n',
              table(['Method', 'Path', 'Authentication', 'Source'], [
                  (r['method'], r['path'], r['authentication'], f"{r['file']}:{r['line']}")
                  for r in evidence('api-inventory.json')])]
    parts += ['## Appendix C. Complete ORM field inventory\n\n',
              'This is the declared SQLAlchemy model schema, not an inspection of private database contents. Runtime migration history and SQLite enforcement limitations are discussed in Section 6.\n\n']
    for model in evidence('schema-inventory.json'):
        rows = []
        for col in model['columns']:
            flags = ['nullable' if col['nullable'] else 'required']
            if col['primary_key']:
                flags.append('primary key')
            if col['unique']:
                flags.append('unique')
            flags.extend('references ' + fk for fk in col['foreign_keys'])
            rows.append((col['name'], col['type'], '; '.join(flags)))
        parts += [f"### {model['table']}\n\n", table(['Column', 'SQL type', 'Declared constraints'], rows)]
    parts += ['## Appendix D. Complete repository file inventory\n\n',
              'Each captured application, configuration, test, or reference file appears once. Line counts describe text files; binary files have no text line count. SHA-256 hashes and parsed symbols are preserved in evidence/source-inventory.json. Generated documentation is excluded from this application inventory.\n\n']
    groups = {}
    for entry in evidence('source-inventory.json'):
        parent = str(Path(entry['path']).parent).replace('\\', '/')
        groups.setdefault(parent, []).append(entry)
    for group, entries in groups.items():
        parts += [f'### {group}\n\n', table(['File', 'Lines', 'Responsibility'], [
            (Path(e['path']).name, e.get('lines', 'binary'), e['purpose']) for e in entries])]
    parts += ['## Appendix E. Test definitions\n\n',
              'Backend function definitions are listed below; parametrized functions can produce multiple executed cases. The authoritative executed count is 45 in backend-tests.txt. Frontend cases are listed separately from their actual test runner output (13 executed cases).\n\n']
    groups = {}
    for test in evidence('test-functions.json'):
        groups.setdefault(test['file'], []).append(test['name'])
    for name, tests in groups.items():
        parts += [f'### {name}\n\n', '\n'.join('- ' + t for t in tests) + '\n\n']
    tap = (ROOT / 'evidence/frontend-tests.txt').read_text(encoding='utf-8-sig')
    frontend_cases = []
    for line in tap.splitlines():
        if '# Subtest: ' in line:
            frontend_cases.append(line.split('# Subtest: ', 1)[1])
        elif line.startswith('✔ '):
            frontend_cases.append(re.sub(r' \([\d.]+ms\)$', '', line[2:]))
    assert len(frontend_cases) == 13, 'Expected all 13 captured frontend test names'
    parts += ['### Frontend executed cases\n\n', '\n'.join('- ' + case for case in frontend_cases) + '\n']
    return ''.join(parts)


def blocks(markdown):
    lines = markdown.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith('```'):
            code = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                code.append(lines[i])
                i += 1
            yield ('code', '\n'.join(code))
        elif line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                cells = [v.strip() for v in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?', c) for c in cells):
                    rows.append(cells)
                i += 1
            yield ('table', rows)
            continue
        elif re.match(r'^#{1,6} ', line):
            prefix, value = line.split(' ', 1)
            yield ('h' + str(len(prefix)), value)
        elif re.match(r'^\s*(?:[-*]|\d+\.) ', line):
            yield ('list', line.strip())
        else:
            paragraph = [line]
            while i + 1 < len(lines) and lines[i + 1].strip() and not re.match(r'^(?:#|\||```|\s*[-*] |\s*\d+\. )', lines[i + 1]):
                i += 1
                paragraph.append(lines[i])
            yield ('p', ' '.join(paragraph))
        i += 1


def inline(value):
    value = html.escape(value)
    value = re.sub(r'`([^`]+)`', r'<code>\1</code>', value)
    value = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', value)
    return re.sub(r'\[([^]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', value)


def make_html(parsed):
    content = []
    nav = []
    for index, (kind, value) in enumerate(parsed):
        if kind.startswith('h'):
            content.append(f'<{kind} id="section-{index}">{inline(value)}</{kind}>')
            if kind == 'h2':
                nav.append(f'<a href="#section-{index}">{inline(value)}</a>')
        elif kind == 'table':
            rows = ['<tr>' + ''.join(f'<th>{inline(c)}</th>' for c in value[0]) + '</tr>']
            body = ['<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in value[1:]]
            content.append('<div class="table-wrap"><table><thead>' + ''.join(rows) + '</thead><tbody>' + ''.join(body) + '</tbody></table></div>')
        elif kind == 'code':
            content.append('<pre><code>' + html.escape(value) + '</code></pre>')
        else:
            content.append(f'<p class="{kind}">{inline(value)}</p>')
    css = '''body{font:15px/1.55 system-ui,sans-serif;color:#172b25;background:#eef3ef;margin:0}main{max-width:1100px;margin:auto;background:white;padding:48px}h1{font-size:34px}h2{border-bottom:2px solid #2d6550;padding-bottom:8px;margin-top:42px}h3{margin-top:28px}h1,h2,h3{color:#194a37;break-after:avoid}p{orphans:3;widows:3}nav{padding:20px;background:#edf5f0}nav a{display:block;font-size:14px}a{color:#205c43}table{border-collapse:collapse;width:100%;font-size:12px;margin:16px 0;table-layout:fixed}td,th{border:1px solid #c8d7cd;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e8f1eb}thead{display:table-header-group}tr{break-inside:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;background:#f3f5f3;padding:14px}code{font-family:Consolas,monospace;overflow-wrap:anywhere}.list{margin:6px 0 6px 20px}.print-note{font-size:13px;color:#4a6356}@media(max-width:700px){main{padding:18px}table{font-size:10px}td,th{padding:5px}}@media print{@page{size:A4;margin:17mm}body{background:white;font-size:10pt}main{max-width:none;padding:0}nav,.print-note{display:none}h2{font-size:16pt}table{font-size:8pt}pre{font-size:7pt}a{color:inherit;text-decoration:none}}'''
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Team 6 — Implementation Iteration Report</title><style>' + css + '</style></head><body><main><p class="print-note">Team 6 · September 17, 2026 · Use your browser’s Print → Save as PDF for a printable copy.</p><nav aria-label="Report sections">' + ''.join(nav) + '</nav>' + ''.join(content) + '</main></body></html>'


def clean(value):
    value = re.sub(r'\[([^]]+)\]\(([^)]+)\)', r'\1 (\2)', value)
    return value.replace('**', '').replace('`', '')


def make_docx(parsed):
    def paragraph(value, style='Normal'):
        runs = []
        for pos, line in enumerate(clean(value).split('\n')):
            if pos:
                runs.append('<w:r><w:br/></w:r>')
            runs.append('<w:r><w:t xml:space="preserve">' + html.escape(line) + '</w:t></w:r>')
        return '<w:p><w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' + ''.join(runs) + '</w:p>'
    body = []
    for kind, value in parsed:
        if kind == 'table':
            rows = []
            for idx, row in enumerate(value):
                props = '<w:trPr><w:cantSplit/>' + ('<w:tblHeader/>' if idx == 0 else '') + '</w:trPr>'
                cells = ''.join('<w:tc><w:tcPr><w:tcW w:w="' + str(9360 // len(row)) + '" w:type="dxa"/>' + ('<w:shd w:fill="E8F1EB"/>' if idx == 0 else '') + '</w:tcPr>' + paragraph(cell, 'TableText') + '</w:tc>' for cell in row)
                rows.append('<w:tr>' + props + cells + '</w:tr>')
            borders = ''.join('<w:' + side + ' w:val="single" w:sz="4" w:color="C8D7CD"/>' for side in ('top','left','bottom','right','insideH','insideV'))
            body.append('<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>' + borders + '</w:tblBorders></w:tblPr><w:tblGrid>' + ''.join('<w:gridCol w:w="' + str(9360 // len(value[0])) + '"/>' for _ in value[0]) + '</w:tblGrid>' + ''.join(rows) + '</w:tbl>')
        else:
            style = {'h1':'Title','h2':'Heading1','h3':'Heading2','h4':'Heading3','code':'Code','list':'ListText'}.get(kind, 'Normal')
            body.append(paragraph(value, style))
    ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + ns + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' + ''.join(body) + '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1273" w:bottom="1000" w:left="1273" w:header="400" w:footer="400"/></w:sectPr></w:body></w:document>'
    styles = '<w:styles ' + ns + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>'
    for name, size in [('Normal',21),('Title',40),('Heading1',30),('Heading2',25),('Heading3',23),('TableText',17),('Code',16),('ListText',21)]:
        heading = name.startswith('Heading') or name == 'Title'
        props = '<w:keepNext/><w:spacing w:before="240" w:after="120"/>' if heading else '<w:spacing w:after="100"/>'
        if name.startswith('Heading'):
            props += '<w:outlineLvl w:val="' + str(int(name[-1]) - 1) + '"/>'
        runs = '<w:sz w:val="' + str(size) + '"/>' + ('<w:b/><w:color w:val="194A37"/>' if heading else '') + ('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' if name == 'Code' else '')
        styles += '<w:style w:type="paragraph" w:styleId="' + name + '"><w:name w:val="' + name + '"/><w:pPr>' + props + '</w:pPr><w:rPr>' + runs + '</w:rPr></w:style>'
    styles += '</w:styles>'
    relns = 'http://schemas.openxmlformats.org/package/2006/relationships'
    offns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
    files = {
        '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>',
        '_rels/.rels':f'<Relationships xmlns="{relns}"><Relationship Id="rId1" Type="{offns}officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml':document,
        'word/styles.xml':styles,
        'word/_rels/document.xml.rels':f'<Relationships xmlns="{relns}"><Relationship Id="rId1" Type="{offns}styles" Target="styles.xml"/><Relationship Id="rId2" Type="{offns}footer" Target="footer1.xml"/></Relationships>',
        'word/footer1.xml':'<w:ftr ' + ns + '><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Team 6 | September 17, 2026 | Page </w:t></w:r><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>',
    }
    with zipfile.ZipFile(ROOT / 'Iteration_Report.docx', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path, content in files.items():
            ElementTree.fromstring(content)
            archive.writestr(path, content.encode('utf-8'))


if __name__ == '__main__':
    report = assemble()
    parsed = list(blocks(report))
    (ROOT / 'Iteration_Report.md').write_text(report, encoding='utf-8')
    (ROOT / 'Iteration_Report.html').write_text(make_html(parsed), encoding='utf-8')
    make_docx(parsed)
    print(f'Generated Markdown, HTML, DOCX: {len(report.split())} words, {len(parsed)} document blocks.')
    print('All DOCX XML parts parsed successfully. Visual pagination requires Word/browser review.')
