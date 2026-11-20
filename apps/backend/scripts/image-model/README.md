# รุ่นตรวจโรคพืช ต้นแบบที่ 6 โมดูล 6.3

สคริปต์ชุดนี้สร้างและวัด `services/image-assessment/model/disease-trees.json` ที่ server ใช้ตอบ `POST /api/image-assessment/assess`

## ข้อมูลที่ใช้

- ภาพใบพืชเปิดจาก PlantVillage (Hughes & Salathé 2015, arXiv:1511.08060) ดึงจาก https://github.com/spMohanty/PlantVillage-Dataset ตอนรัน ไม่เก็บภาพไว้ในเรโป
- สัญญาอนุญาต: ชุดต้นฉบับบน Mendeley (data.mendeley.com/datasets/tywbtsjrjv/1) เป็น CC0 1.0 ตามหน้า Meta-Album (meta-album.github.io/datasets/PLT_VIL.html) แต่ mirror ที่สคริปต์ดึงจริง (github.com/spMohanty/PlantVillage-Dataset) ไม่มีไฟล์ LICENSE ฝาแฝดบน Hugging Face (mohanty/PlantVillage) ประกาศ CC BY-SA 3.0 และ OpenML d/44242 (ชุด Meta-Album micro) เป็น CC BY-NC 4.0 · ห้ามใช้ภาพชุดนี้ในวิดีโอ/สื่อเผยแพร่จนกว่าจะยืนยันสัญญาอนุญาต
- เป็นภาพใบเดี่ยวพื้นหลังเรียบของมะเขือเทศ มันฝรั่ง พริกหวาน ข้าวโพด ฟักทอง เชอร์รี องุ่น ไม่ใช่ภาพแปลง และไม่ใช่สมุนไพร 6 ชนิดของโครงการ
- การจับคู่โรคของ PlantVillage เข้ากับ 7 โรคตามสัญญาอยู่ใน `plantvillage-mapping.json` โคนเน่าและยอดเหี่ยวไม่มีภาพในชุดนี้ รุ่นนี้จึงไม่ให้คะแนนสองโรคนี้

## รันซ้ำ

ทุกขั้นรันซ้ำได้ ขั้นที่ทำแล้วจะไม่ทำใหม่ ยกเว้นการฝึกและการวัด

```bash
cd apps/backend
CACHE=~/work/state/proto56-plantvillage
node scripts/image-model/fetch-plantvillage.js "$CACHE"        # ดึงภาพ 240 ภาพต่อกลุ่ม + manifest.json แบ่ง train/test ด้วย hash ชื่อไฟล์
node scripts/image-model/extract-features.js "$CACHE"          # เวกเตอร์ 139 ค่าต่อภาพ ด้วย extractor ตัวเดียวกับ server
python3 scripts/image-model/train_disease_model.py "$CACHE"    # เลือกค่าตั้งด้วย 5-fold CV บนภาพฝึกเท่านั้น แล้วฝึก + ตรวจพืชที่ไม่เคยเห็น
node scripts/image-model/evaluate-disease-model.js "$CACHE" report.json   # วัดบนภาพทดสอบ เขียน disease-trees.card.json
```

`train_disease_model.py` ต้องมี scikit-learn และ numpy ส่วน server อ่านต้นไม้จาก JSON เอง ไม่ต้องติดตั้งอะไรเพิ่ม `evaluate-disease-model.js` หยุดทันทีถ้าผลของ JavaScript ต่างจาก scikit-learn เกิน 1e-9 และบันทึก sha256 ของไฟล์รุ่นลงในการ์ด เทสต์ `disease-classifier.test.js` จะไม่ผ่านถ้าฝึกใหม่แล้วไม่วัดใหม่

## พืชที่ไม่เคยเห็น

ความแม่นยำบนภาพทดสอบวัดกับพืชและโรคชุดเดียวกับที่ฝึก ตอนฝึกสคริปต์ทำการตรวจอีกชุด คือเอาภาพของพืชหนึ่งชนิดในโรคหนึ่ง (หนึ่งโฟลเดอร์ต้นทาง) ออกจากการฝึกทั้งหมดแล้วให้รุ่นทาย ผลอยู่ที่ `training.unseenCropCheck` ในไฟล์รุ่น และหน้าจอแสดงไว้ใต้ตารางความแม่นยำ ตัวเลขนี้ใกล้กับสถานการณ์สมุนไพรที่รุ่นไม่เคยเห็นมากกว่า
