import sys, json, hashlib
from html.parser import HTMLParser
class P(HTMLParser):
    def __init__(s): super().__init__(); s.out=[]; s.skip=0; s.cur=[]
    def handle_starttag(s,t,a):
        if t in('script','style','noscript'): s.skip+=1
        if t in('p','h1','h2','h3','li'): s.cur=[]
    def handle_endtag(s,t):
        if t in('script','style','noscript'): s.skip-=1
        if t in('p','h1','h2','h3','li'):
            x=' '.join(''.join(s.cur).split())
            if len(x)>60: s.out.append(x)
            s.cur=[]
    def handle_data(s,d):
        if not s.skip: s.cur.append(d)
def paras(page):
    p=P(); p.feed(open(f'/tmp/p13src/dl/page-{page}.html',encoding='utf-8',errors='ignore').read()); return p.out
SOURCES = {
 'THANSETTAKIJ_2568_DTAM_GACP': dict(page='7cdf10', title='กรมการแพทย์แผนไทย แจงขั้นตอนรับรอง กัญชาทางการแพทย์ มาตรฐาน GACP', publisher='ฐานเศรษฐกิจ', published='2025-07-11', url='https://www.thansettakij.com/health-wellness/wellbeing/632551'),
 'THAIPBS_2568_CANNABIS_NETWORK': dict(page='fa0136', title='เช็ก 5 กลุ่มอาการใช้กัญชารักษาได้ สธ.ติวเข้มแพทย์ออกใบสั่งยา', publisher='Thai PBS Policy Watch', published='2025-07-21', url='https://policywatch.thaipbs.or.th/article/life-168'),
 'KHON_KAEN_AGR_J_TURMERIC': dict(page='d20d8e', title='ความรู้ และความคิดเห็นต่อการผลิตขมิ้นชันตามมาตรฐาน GAP และหลักเกณฑ์ GMP ของเกษตรกร อำเภอป่าพะยอม จังหวัดพัทลุง (มณฑิรา สังขจร และคณะ) วารสารแก่นเกษตร ปีที่ 50 ฉบับที่ 5', publisher='วารสารแก่นเกษตร (ThaiJO, CC BY-NC-ND 4.0)', published='2565', url='https://li01.tci-thaijo.org/index.php/agkasetkaj/article/view/250735'),
 'MATICHON_2562_GPO_HERBAL': dict(page='5a3312', title='เปิดมาตรฐาน บริษัทร่วมทุน อภ. ยกระดับการผลิตสมุนไพรไทย', publisher='มติชน', published='2019-02-20', url='https://www.matichon.co.th/local/news_1371865'),
 'NAEWNA_2565_KRATOM_LAB': dict(page='256f4c', title='ก.เกษตรฯ เซ็นทรัลแล็บไทย หนุนผู้ประกอบการดันกระท่อมสู่ตลาดตะวันออกกลาง', publisher='แนวหน้า', published='2022-10-03', url='https://www.naewna.com/local/684075'),
 'THANSETTAKIJ_2564_KRATOM_FARMERS': dict(page='062626', title='ถามกันจัง ปลูกพืชกระท่อม จะขายใคร ฟังคำตอบทางนี้', publisher='ฐานเศรษฐกิจ', published='2021-09-07', url='https://www.thansettakij.com/economy/494858'),
}
# (source, para, start, end_inclusive, group, speaker)
EX = [
 ('THANSETTAKIJ_2568_DTAM_GACP', 7, 'ส่วนประเด็นความล่าช้าที่พบ', 'ทำให้คำขอยังคงค้างอยู่ในระบบ', 'OFFICIAL', 'ผู้อำนวยการกองพัฒนายาแผนไทยและสมุนไพร กรมการแพทย์แผนไทยฯ'),
 ('THANSETTAKIJ_2568_DTAM_GACP', 4, 'โดยทุกครั้งที่มีการเก็บเกี่ยว', 'ตามประกาศของคณะกรรมการอาหารและยา', 'OFFICIAL', 'รองอธิบดีกรมการแพทย์แผนไทยฯ'),
 ('THANSETTAKIJ_2568_DTAM_GACP', 11, 'นอกจากนี้ยังมีการคัดเลือกผู้ที่มีความรู้ความสามารถ', 'ที่ประสงค์จะยกระดับคุณภาพตามมาตรฐาน GACP', 'OFFICIAL', 'ผู้อำนวยการกองพัฒนายาแผนไทยและสมุนไพร กรมการแพทย์แผนไทยฯ'),
 ('THANSETTAKIJ_2568_DTAM_GACP', 20, 'ทั้งนี้ กรมการแพทย์แผนไทยฯ ขอเชิญชวนผู้ประกอบการทุกท่านที่ยังสับสนหรือมีข้อสงสัย', 'จากระบบ e-Learning ในเว็บไซต์ของกรมการแพทย์แผนไทยฯ', 'OFFICIAL', 'กรมการแพทย์แผนไทยฯ'),
 ('THAIPBS_2568_CANNABIS_NETWORK', 11, 'เครือข่ายเสนอให้ยกเลิกข้อกำหนดที่ให้เกษตรกรต้องมีใบรับรอง GACP', 'ควรใช้เฉพาะกับการผลิตเพื่อส่งออก', 'CIVIL_SOCIETY', 'เครือข่ายเขียนอนาคตกัญชาไทย'),
 ('THAIPBS_2568_CANNABIS_NETWORK', 12, 'เครือข่ายระบุว่าการบังคับใช้ประกาศฉบับนี้ก่อให้เกิด', 'ทั้งต่อผู้ผลิต ผู้ใช้ และผู้ค้าชุมชน', 'CIVIL_SOCIETY', 'เครือข่ายเขียนอนาคตกัญชาไทย'),
 ('THAIPBS_2568_CANNABIS_NETWORK', 16, 'แต่อีกฝั่งคือเสียงเรียกร้อง', 'เพื่อสุขภาวะอย่างค่อนข้างเสรี', 'CIVIL_SOCIETY', 'สรุปของกองบรรณาธิการ'),
 ('KHON_KAEN_AGR_J_TURMERIC', 1, 'เกษตรกรส่วนใหญ่ใช้เงินทุนตนเองในการปลูกขมิ้นชัน', 'เป็นสมาชิกกลุ่มทางการเกษตร', 'RESEARCH', 'ผลสัมภาษณ์เกษตรกรผู้ปลูกขมิ้นชัน 104 ราย'),
 ('KHON_KAEN_AGR_J_TURMERIC', 1, '2) เกษตรกรมีความรู้ระดับมากเกี่ยวกับมาตรฐาน GAP', 'ผลิตขมิ้นชันตามหลักเกณฑ์ GMP ในระดับมาก', 'RESEARCH', 'ผลสัมภาษณ์เกษตรกรผู้ปลูกขมิ้นชัน 104 ราย'),
 ('KHON_KAEN_AGR_J_TURMERIC', 1, 'ดังนั้นหน่วยงานของภาครัฐควรมีการส่งเสริมให้เกษตรกรปฏิบัติตามมาตรฐาน GAP', 'ปฏิบัติตามมาตรฐาน GAP', 'RESEARCH', 'ข้อเสนอของคณะผู้วิจัย'),
 ('MATICHON_2562_GPO_HERBAL', 0, 'แต่ปัญหาคือ หากผู้บริโภคเลือกซื้อสมุนไพรที่ราคาถูกๆ', 'ในการผลิตด้วยวิธีการถูกๆ ด้วย', 'INDUSTRY', 'ผู้อำนวยการบริษัทผลิตภัณฑ์สมุนไพรไทย จำกัด (บริษัทร่วมทุน อภ.)'),
 ('MATICHON_2562_GPO_HERBAL', 2, 'นอกจากสายพันธุ์ที่ดีแล้ว กระบวนการเพาะปลูกก็สำคัญ', 'ไปจนถึงสารโลหะหนักต่างๆ', 'INDUSTRY', 'ผู้อำนวยการบริษัทผลิตภัณฑ์สมุนไพรไทย จำกัด (บริษัทร่วมทุน อภ.)'),
 ('MATICHON_2562_GPO_HERBAL', 3, 'เกษตรกรสามารถรับพันธุ์พืชที่ดีจากกรมวิชาการเกษตร', 'จะได้รับคำแนะนำจากฝ่ายวิชาการของทางบริษัท', 'INDUSTRY', 'ผู้อำนวยการบริษัทผลิตภัณฑ์สมุนไพรไทย จำกัด (บริษัทร่วมทุน อภ.)'),
 ('MATICHON_2562_GPO_HERBAL', 7, 'การผลิตผลิตภัณฑ์สมุนไพรในระดับรัฐวิสาหกิจ ชุมชน', 'ตรงนี้เป็นปัญหาที่ภาครัฐต้องเข้ามาช่วย', 'INDUSTRY', 'ผู้อำนวยการบริษัทผลิตภัณฑ์สมุนไพรไทย จำกัด (บริษัทร่วมทุน อภ.)'),
 ('NAEWNA_2565_KRATOM_LAB', 3, 'สำหรับการออกหลักเกณฑ์การสุ่มตัวอย่าง', 'จะได้เร่งรัดให้หน่วยงานที่เกี่ยวข้องดำเนินการ', 'OFFICIAL', 'ที่ปรึกษารัฐมนตรีช่วยว่าการกระทรวงเกษตรและสหกรณ์'),
 ('NAEWNA_2565_KRATOM_LAB', 4, 'นอกจากยังสามารถให้การตรวจคุณภาพระหว่างกระบวนการปลูก', 'มีความมั่นใจในคุณภาพของผลผลิตจากพืชกระท่อม', 'LAB', 'กรรมการผู้อำนวยการ บริษัท ห้องปฏิบัติการกลาง (ประเทศไทย) จำกัด'),
 ('NAEWNA_2565_KRATOM_LAB', 5, 'ฉนั้นสิ่งที่คำนึงถึงคือความเป็นมาตรฐาน', 'มาตรฐาน GAP,GMP และการแปรรูปอื่นๆ', 'INDUSTRY', 'ผู้ประกอบการส่งออกพืชกระท่อม'),
 ('THANSETTAKIJ_2564_KRATOM_FARMERS', 1, 'ถามกันจัง “ปลูกพืชกระท่อม” จะขายใคร', 'เพื่อทำเป็นผลิตภัณฑ์อาหารและเครื่องดื่ม', 'FARMER_NETWORK', 'เลขาธิการสภาเครือข่ายเกษตรกรชาวสวนยางแห่งประเทศไทย'),
 ('THANSETTAKIJ_2564_KRATOM_FARMERS', 6, 'แต่เราจะไม่ทิ้งยาง', 'ตามชุดความคิด “สวนยางยั่งยืน”', 'FARMER_NETWORK', 'เลขาธิการสภาเครือข่ายเกษตรกรชาวสวนยางแห่งประเทศไทย'),
]
cache={}
out=[]
for i,(src,para,start,end,group,speaker) in enumerate(EX,1):
    page=SOURCES[src]['page']
    ps=cache.setdefault(page, paras(page))
    text=ps[para]
    a=text.find(start); assert a>=0,(src,para,start)
    b=text.find(end,a); assert b>=0,(src,para,end)
    excerpt=text[a:b+len(end)]
    assert excerpt in text
    out.append(dict(id=f'X{i:02d}', sourceId=src, group=group, speaker=speaker, text=excerpt))
hashes={k: hashlib.sha256(open(f"/tmp/p13src/dl/page-{v['page']}.html",'rb').read()).hexdigest() for k,v in SOURCES.items()}
for x in out:
    if x['speaker']=='สรุปของกองบรรณาธิการ': x['speaker']='กองบรรณาธิการ สรุปเสียงของผู้ใช้กัญชาและชุมชน'
for k in SOURCES:
    if SOURCES[k]['published']=='2565': SOURCES[k]['published']='2022'
json.dump(dict(sources={k:{kk:vv for kk,vv in v.items() if kk!='page'} for k,v in SOURCES.items()}, excerpts=out, pageSha256=hashes), open(sys.argv[1] if len(sys.argv)>1 else '/tmp/p13src/corpus.json','w'), ensure_ascii=False, indent=1)
print(len(out), 'excerpts verified verbatim'); print(max(len(x['text']) for x in out), 'max chars')
