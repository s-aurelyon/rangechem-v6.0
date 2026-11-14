"""Import the supplied Excel catalogue without altering the workbook."""
import json, re, sys, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
source = Path(sys.argv[1])
with zipfile.ZipFile(source) as book:
    strings = [''.join(t.text or '' for t in item.findall('.//x:t', NS)) for item in ET.fromstring(book.read('xl/sharedStrings.xml'))]
    sheet = ET.fromstring(book.read('xl/worksheets/sheet1.xml'))
    products = []
    for row in sheet.findall('.//x:row', NS)[1:]:
        cells = {}
        for cell in row.findall('x:c', NS):
            value = cell.find('x:v', NS)
            cells[re.sub(r'\d', '', cell.get('r'))] = (strings[int(value.text)] if cell.get('t') == 's' else value.text) if value is not None else ''
        if not cells.get('B'): continue
        code = cells.get('E', '').strip()
        image = cells.get('D', '').strip().replace('\\', '/')
        products.append(dict(category=cells.get('A', '').strip() or 'Other', name=cells['B'].strip(), description=cells.get('C', '').strip(), image=image, stock_code=code, size=cells.get('F', '').strip(), tags=cells.get('G', '').strip()))
Path('data').mkdir(exist_ok=True)
Path('data/products.json').write_text(json.dumps(products, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Imported {len(products)} product rows')
