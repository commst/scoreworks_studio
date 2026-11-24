import sys, re
import os
XSD = os.environ.get('XSD_DIR', '/home/claude/work/xsd')   # https://raw.githubusercontent.com/w3c/musicxml/v4.0/schema/{musicxml,xml,xlink}.xsd 를 받아 둔 폴더
from lxml import etree
xsd = open(XSD + '/musicxml.xsd', 'rb').read()
xsd = re.sub(rb'schemaLocation="[^"]*xml\.xsd"', b'schemaLocation="' + XSD.encode() + b'/xml.xsd"', xsd)
xsd = re.sub(rb'schemaLocation="[^"]*xlink\.xsd"', b'schemaLocation="' + XSD.encode() + b'/xlink.xsd"', xsd)
schema = etree.XMLSchema(etree.fromstring(xsd, base_url=XSD + '/'))
for f in sys.argv[1:]:
    doc = etree.parse(f, etree.XMLParser(load_dtd=False, no_network=True, resolve_entities=False))
    ok = schema.validate(doc)
    errs = list(schema.error_log)
    from collections import Counter
    c = Counter(re.sub(r"line \d+", "", e.message)[:160] for e in errs)
    print(f, 'VALID' if ok else f'INVALID {len(errs)}')
    for m, n in c.most_common(6): print('   ', n, m)
