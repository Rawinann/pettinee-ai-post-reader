from pathlib import Path
import zipfile
from xml.sax.saxutils import escape

rows = [
    ['ข้อมูลจำลองสำหรับทดสอบ ไม่ใช่โพสต์จริงจาก Facebook'],
    [],
    ['postId','หมวด','ข้อความโพสต์','ลิงก์ต้นทาง','ข้อความคอมเมนต์','สรุปคอมเมนต์','สถานะคอมเมนต์'],
    ['fixture-water','อาหาร/พฤติกรรม/อุปกรณ์','อยากซื้อน้ำพุแมวแบบแบตเตอรี่ วัสดุสเตนเลส งบ 1,500 บาท ควรดูอะไรบ้าง','','บ้านเราใช้สเตนเลสแล้วชอบ ถอดล้างง่าย','','บางส่วน'],
    ['fixture-water','อาหาร/พฤติกรรม/อุปกรณ์','','','ลองดูว่าปั๊มถอดล้างได้ไหม และขอระยะใช้งานแบตเตอรี่จากร้าน','','บางส่วน'],
    ['fixture-clinic','สถานพยาบาล','ขอรีวิวคลินิกแมวใกล้บ้าน อยากทราบค่าใช้จ่ายและเวลาเปิด','','','สมาชิกแนะนำหลายคลินิก แต่ไม่มีรายละเอียดราคาและเวลาเปิด','บางส่วน']
]
directory = Path(__file__).parent
sheet = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
for n, row in enumerate(rows, 1):
    sheet += f'<row r="{n}">'
    for i, value in enumerate(row):
        sheet += f'<c r="{chr(65+i)}{n}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
    sheet += '</row>'
sheet += '</sheetData></worksheet>'
declaration = '<?xml version="1.0" encoding="UTF-8"?>'
with zipfile.ZipFile(directory / 'import-demo.xlsx', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('[Content_Types].xml', declaration + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
    archive.writestr('_rels/.rels', declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    archive.writestr('xl/workbook.xml', declaration + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="ข้อมูลจำลอง" sheetId="1" r:id="rId1"/></sheets></workbook>')
    archive.writestr('xl/_rels/workbook.xml.rels', declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
    archive.writestr('xl/worksheets/sheet1.xml', declaration + sheet)
print(directory / 'import-demo.xlsx')
