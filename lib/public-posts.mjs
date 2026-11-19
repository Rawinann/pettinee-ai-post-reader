export const PUBLIC_FILE='Pettinee_Facebook_200_Posts_Public_Excerpts_19Nov2026.xlsx';
export function publicPostRows(workbook){
  const sheet=workbook.sheets.find(s=>s.name==='โพสต์ 200 รายการ');
  if(!sheet)throw new Error('ไม่พบชีต โพสต์ 200 รายการ');
  return sheet.rows.map(row=>({
    postId:row['Post ID']||'',category:'คำค้น: '+(row['คำค้นที่พบ']||'ไม่ระบุ'),
    text:row['ข้อความตัดตอนที่เห็นในหน้าโพสต์ (ไม่ใช่โพสต์เต็ม)']||'',url:row['URL โพสต์สาธารณะ']||'',
    sourceNote:row['หมายเหตุแหล่งข้อมูล']||'',accessStatus:row['สถานะการเปิดหน้า']||'',checkedAt:row['วันที่ตรวจ']||'',searchTerm:row['คำค้นที่พบ']||'',
  }));
}
export function postOnlyGuide(post){
  // A visible preparation template, never an inferred clinical assessment.
  return {
    text:post.text||'',
    missing:post.text?['อายุและประวัติของแมว','เวลาเริ่มและสิ่งที่เปลี่ยนไป','สิ่งที่ลองแล้วและผลที่สังเกต','คำถามหลักที่เจ้าของต้องการตัดสินใจ']:['ยังไม่มีข้อความโพสต์ให้ทบทวน เปิดลิงก์ต้นทางหรือเติมข้อมูลก่อน'],
    question:post.text?'จากข้อความตัดตอนนี้ ควรเตรียมข้อมูลใดเพิ่มเพื่อช่วยทำความเข้าใจปัญหา โดยยังไม่สรุปสาเหตุหรือวิธีรักษา?':'ยังไม่พบข้อความโพสต์ ควรเติมข้อมูลอะไรเพื่อเริ่มถามเรื่องนี้ได้?',
  };
}
