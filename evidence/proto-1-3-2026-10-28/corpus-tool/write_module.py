# usage: python3 -I write_module.py corpus.json apps/backend/data/research/stakeholder-needs-corpus.js sha256.json
import json, sys
d = json.load(open(sys.argv[1]))
def js(v): return json.dumps(v, ensure_ascii=False)
L = ["'use strict';", "", "/**",
     " * ชุดข้อความสาธารณะเรื่องความต้องการของผู้มีส่วนได้ส่วนเสีย GACP สมุนไพร (ต้นแบบที่ 3)",
     " *",
     " * ใช้เมื่อระบบยังไม่มีคำตอบแบบสำรวจหรือบทสัมภาษณ์จริง ทุกข้อความคัดคำต่อคำจากหน้าเว็บที่ระบุ",
     " * อ่านและตรวจว่าตรงตัวอักษรเมื่อ 2026-10-28 (sha256 ของหน้าที่ดาวน์โหลดอยู่ใน evidence/proto-1-3-2026-10-28)",
     " * เป็นข้อความที่เผยแพร่แล้ว ไม่ใช่คำตอบของผู้ตอบแบบสำรวจ และไม่ใช่ข้อมูลภาคสนาม",
     " * อ้างสั้น ๆ พร้อมระบุแหล่งเพื่อการวิจัย (พ.ร.บ.ลิขสิทธิ์ มาตรา 32-33)",
     " */", "", "const CORPUS_READ_ON = '2026-10-28';", "", "const CORPUS_SOURCES = Object.freeze({"]
for k, v in d['sources'].items():
    L.append(f"    {k}: {{")
    for kk in ['title', 'publisher', 'published', 'url']:
        L.append(f"        {kk}: {js(v[kk])},")
    L.append("    },")
L += ["});", "", "const CORPUS_EXCERPTS = Object.freeze(["]
for x in d['excerpts']:
    L.append("    {")
    for kk in ['id', 'sourceId', 'group', 'speaker', 'text']:
        L.append(f"        {kk}: {js(x[kk])},")
    L.append("    },")
L += ["]);", "", "module.exports = { CORPUS_READ_ON, CORPUS_SOURCES, CORPUS_EXCERPTS };"]
open(sys.argv[2], 'w', encoding='utf-8').write('\n'.join(L) + '\n')
json.dump(d['pageSha256'], open(sys.argv[3], 'w'), indent=1)
