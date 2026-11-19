/**
 * Deterministic demo templates. Source strings are data, never instructions.
 * No provider, model, clinical approval, or external verification is implied.
 */
export const CLAIM_STATUSES = Object.freeze({
  1: 'มีประโยชน์และนำไปใช้ได้ตามบริบท',
  2: 'เป็นประสบการณ์ส่วนตัว',
  3: 'มีหลักฐานรองรับ',
  4: 'ชวนเข้าใจผิดหรือควรแก้ข้อสรุป',
  5: 'ข้อมูลไม่พอจะตรวจ',
});

// Team approval is an explicit data input, never inferred from a website/domain.
// This prototype has no team-approved veterinary sources or urgency criteria.
export const APPROVED_EVIDENCE = Object.freeze([]);

const HEALTH_LIMIT = 'ยังไม่มีแหล่งสัตวแพทย์และเกณฑ์ความเร่งด่วนที่ทีมอนุมัติในระบบ จึงไม่วินิจฉัย ไม่แนะนำขนาดยาหรือการเปลี่ยนยา และไม่จัดระดับความเร่งด่วนจากโพสต์';
const UNKNOWN = 'ไม่ทราบจากข้อมูลที่มี';
const cleanComments = post => Array.isArray(post.comments) ? post.comments.filter(c => c && typeof c.id === 'string' && typeof c.text === 'string') : [];
const item = (text, commentIds = []) => ({ text, commentIds });
const unknownClaim = (commentId, quote) => ({
  commentId, quote, status: 5,
  reason: 'Demo ยังไม่ได้ตรวจข้ออ้างนี้กับหลักฐานหรือรายละเอียดเคส และไม่ใช้ยอดไลก์ จำนวนคนเห็นด้วย หรือคำตอบ AI เป็นหลักฐาน',
  scope: 'ใช้เป็นประเด็นให้ผู้ใช้ตรวจต่อ ไม่ใช่ข้อสรุปว่าข้ออ้างจริงหรือเท็จ', evidence: [],
});

function fountainRecommendation() {
  return {
    answer: 'แนวทาง Demo ที่เตรียมไว้ล่วงหน้า: เริ่มจากเทียบวัสดุ แบตเตอรี่ และการถอดล้างของรุ่นที่สนใจ ตารางนี้เป็นเกณฑ์ช่วยตั้งคำถาม ไม่ใช่ผลวิเคราะห์จากโมเดล และยังไม่จัดอันดับรุ่นหรือยืนยันคุณภาพจากข้อมูลที่มี',
    options: [
      { action: 'เลือกรุ่นที่สนใจ 2–3 รุ่นแล้วขอรายละเอียดจากผู้ขายหรือคู่มือ', reason: 'จะได้เทียบข้อมูลของรุ่นเดียวกันและตรวจสิ่งที่คอมเมนต์ยังไม่ระบุ' },
      { action: 'เทียบต้นทุนรวมและเวลาที่ใช้ดูแลกับงบของบ้าน', reason: 'ราคาเครื่องอย่างเดียวไม่บอกค่าไส้กรอง อะไหล่ หรือความสะดวกในการใช้งานจริง' },
    ],
    comparison: [
      { criterion: 'วัสดุ', check: 'วัสดุส่วนที่สัมผัสน้ำ รอยต่อ และข้อกำหนดการล้างในคู่มือ', context: 'เทียบกับน้ำหนัก พื้นที่ตั้ง และวิธีล้างที่ทำได้จริง โดยยังไม่สรุปว่าวัสดุใดดีกว่าเสมอ' },
      { criterion: 'แบตเตอรี่และแหล่งจ่ายไฟ', check: 'ใช้ไฟแบบใด ต้องชาร์จอย่างไร เปลี่ยนแบตได้หรือไม่ และมีเงื่อนไขรับประกันอะไร', context: 'เทียบกับตำแหน่งปลั๊กและรอบดูแลของบ้าน ข้อมูลระยะใช้งานต้องยืนยันกับรุ่นจริง' },
      { criterion: 'การถอดล้าง', check: 'ต้องถอดกี่ชิ้น เข้าถึงปั๊มได้หรือไม่ ใช้เครื่องมือหรือไม่ และหาอะไหล่ได้ที่ใด', context: 'เลือกขั้นตอนที่ทำซ้ำได้สะดวกตามคู่มือของรุ่นนั้น' },
    ],
  };
}

function base(post) {
  const comments = cleanComments(post);
  const text = typeof post.text === 'string' ? post.text : '';
  return {
    version: 1, mode: 'demo',
    summary: {
      happened: text ? `ข้อความต้นทางระบุ: ${text.slice(0, 800)}${text.length > 800 ? '… (ตัดแสดงบางส่วน)' : ''}` : UNKNOWN,
      tried: UNKNOWN,
      decision: 'ยังไม่ได้แยกคำถามหลักอัตโนมัติใน Demo โปรดตรวจข้อความต้นทางและแก้ในสรุปก่อนถามต่อ',
      missing: ['รายละเอียดที่ผู้โพสต์ยังไม่ได้ระบุ', ...(comments.length ? [] : ['ไม่มีข้อความคอมเมนต์รายรายการให้ตรวจ'])],
    },
    recommendation: {
      answer: 'Demo นี้ยังตอบคำถามเฉพาะของโพสต์ที่นำเข้าไม่ได้ ใช้ข้อความต้นทางและคอมเมนต์ที่มีเพื่อเตรียมคำถามต่อ โดยตรวจสิ่งที่ทราบและสิ่งที่ยังไม่ทราบก่อน',
      options: [
        { action: 'ระบุคำถามหลักเพียงหนึ่งข้อ', reason: 'ช่วยให้ผู้ตอบทราบว่าต้องการตัดสินใจเรื่องใด' },
        { action: 'แยกข้อมูลที่พบจริงออกจากข้อสรุปของคอมเมนต์', reason: 'ข้อมูลที่ยังไม่มีหลักฐานไม่ควรถูกยืนยันเพราะมีคนเห็นด้วย' },
      ],
    },
    thread: {
      common: post.commentSummary ? [item(`ข้อมูลถอดความที่นำเข้า: ${post.commentSummary.slice(0, 16000)}${post.commentSummary.length > 16000 ? '… (ตัดแสดงบางส่วน โปรดอ่านข้อมูลต้นทาง)' : ''}`)] : comments.length ? [item('ยังไม่ได้สรุปประเด็นร่วมอัตโนมัติใน Demo โปรดอ่านคอมเมนต์ต้นทางด้านล่าง', comments.map(c => c.id))] : [item('ไม่มีคอมเมนต์หรือสรุปคอมเมนต์ในข้อมูลที่มี')],
      differences: [item('ยังไม่ทราบจุดที่เห็นต่างจากข้อมูลที่มี')],
      unanswered: [{ id: 'generic-context', text: 'คำถามหลักและข้อจำกัดของเคสยังต้องตรวจเพิ่มเติม', question: 'จากข้อมูลที่มี ควรเตรียมข้อมูลอะไรเพิ่มเพื่อช่วยตอบคำถามหลักของโพสต์นี้?', commentIds: [] }],
    },
    claims: comments.flatMap(c => c.text.split(/[;；\n]+/u).map(t => t.trim()).filter(Boolean).map(quote => unknownClaim(c.id, quote))),
    reviewReasons: [],
  };
}

function applyHealthLimit(result) {
  result.recommendation.answer = HEALTH_LIMIT;
  result.recommendation.options = [
    { action: 'เตรียมลำดับอาการ สิ่งที่ลองแล้ว และข้อมูลที่ยังขาดสำหรับสอบถามสัตวแพทย์', reason: 'โพสต์และประสบการณ์ของแมวตัวอื่นยังใช้สรุปสาเหตุหรือเลือกการรักษาเฉพาะเคสไม่ได้' },
    { action: 'สอบถามทีมรักษาเกี่ยวกับแผนเดิมและข้อมูลที่ต้องส่งเพิ่ม', reason: 'ช่วยให้ทีมรักษาประเมินจากรายละเอียดเคสจริง' },
  ];
  result.reviewReasons.push('เกี่ยวกับสุขภาพ แต่ยังไม่มีชุดแหล่งสัตวแพทย์หรือเกณฑ์ความเร่งด่วนที่ทีมอนุมัติ');
}

export function analyzeDemo(post) {
  const result = base(post);
  const isKnown = ['paraphrased', 'simulated'].includes(post.provenance);
  // Keyword routing only selects a more limited prepared template. It is NOT a
  // clinical classifier, triage decision, or safety gate for a live provider.
  const health = /ผื่น|ทายา|กินยา|ชื่อยา|ใช้ยา|เปลี่ยนยา|แผล|ทำหมัน|สุขภาพ|อาการ|ป่วย|อาเจียน|ซึม|เลือด|ท้องเสีย|รักษา|หายใจ/u.test(`${post.category || ''} ${post.text || ''}`);
  if (/น้ำพุ/u.test(post.text || '') && !health) result.recommendation = fountainRecommendation();
  if (health) applyHealthLimit(result);

  // Rich prepared responses require the known demo case text, not a user-supplied ID.
  if (isKnown && post.id === '41' && post.text === 'หลังทำหมันวันที่ 5–6 แผลยังดูบวม จึงถามว่าปกติหรือไม่') {
    result.summary = {
      happened: 'แผลยังดูบวมในวันที่ 5–6 หลังทำหมัน ตามข้อความถอดความ',
      tried: 'ทราบว่าผ่าตัดทำหมันแล้ว แต่ไม่ทราบรายละเอียดการดูแลหรือการติดต่อคลินิก',
      decision: 'ลักษณะแผลที่เห็นเป็นไปตามแผนดูแลหลังผ่าตัดหรือควรสอบถามคลินิกอย่างไร',
      missing: ['รายละเอียดการดูแลเดิม', 'ภาพแผลและการเปลี่ยนแปลงตามวัน', 'อาการร่วมและข้อมูลจากคลินิก', 'ข้อความคอมเมนต์รายรายการ'],
    };
    result.thread = {
      common: [item('ข้อมูลถอดความกล่าวถึงการติดตามแผลหลังผ่าตัด')],
      differences: [item('ข้อมูลถอดความมีทั้งแนวทางสังเกตต่อและให้สัตวแพทย์ตรวจ แต่ไม่มีรายละเอียดว่าความเห็นใดใช้กับบริบทใด')],
      unanswered: [{ id: 'wound-followup', text: 'ไม่มีข้อมูลว่าแผลตรงกับแผนดูแลที่คลินิกให้หรือไม่', question: 'ควรเตรียมภาพแผล วันที่ผ่าตัด และข้อมูลใดให้คลินิกประเมินแผลหลังทำหมันที่ยังดูบวม?', commentIds: [] }],
    };
  }

  if (isKnown && post.id === '100' && post.text === 'โพสต์ถามหาประสบการณ์จากคนที่เคยใช้น้ำพุแมวจริง') {
    result.summary = {
      happened: 'กำลังขอรีวิวน้ำพุแมวจากผู้ที่เคยใช้ ตามข้อความถอดความ',
      tried: 'ชุดข้อมูลไม่ได้บอกว่าซื้อหรือทดลองรุ่นใดแล้ว',
      decision: 'จะใช้เกณฑ์ใดเทียบรุ่นให้เหมาะกับการใช้งานของบ้าน',
      missing: ['งบประมาณ', 'รุ่นที่สนใจ', 'พื้นที่และแหล่งจ่ายไฟ', 'เวลาที่สะดวกถอดล้าง', 'ข้อความคอมเมนต์รายรายการ'],
    };
    result.recommendation = fountainRecommendation();
    result.thread = {
      common: [item('ข้อมูลถอดความกล่าวถึงวัสดุ แบตเตอรี่ และความสะดวกในการทำความสะอาด')],
      differences: [item('ไม่มีข้อความรายคอมเมนต์ให้ระบุว่าใครเห็นต่างเรื่องใด')],
      unanswered: [{ id: 'fountain-compare', text: 'ยังไม่มีข้อมูลเทียบรุ่นภายใต้งบและเงื่อนไขเดียวกัน', question: 'ถ้าเน้นถอดล้างง่าย ควรถามข้อมูลวัสดุ แบตเตอรี่ และชิ้นส่วนที่ต้องล้างของแต่ละรุ่นอย่างไร?', commentIds: [] }],
    };
  }

  if (post.provenance === 'simulated' && post.id === 'S1' && post.text === 'แมวมีผื่นตามตัว ซื้อยามาทาแล้วไม่ดีขึ้น มียาตัวอื่นแนะนำไหม หรือควรพาไปตรวจ?') {
    result.summary = {
      happened: 'ผู้โพสต์บอกว่าแมวมีผื่นตามตัวและยังไม่ดีขึ้นหลังทายา',
      tried: 'ซื้อยามาทา ยังไม่ทราบชื่อยา ระยะเวลาที่ใช้ หรือคำแนะนำเดิม',
      decision: 'กำลังถามถึงยาตัวอื่นหรือการพาไปตรวจ',
      missing: ['ชื่อยาและฉลาก', 'วันที่เริ่มมีผื่นและวันที่เริ่มใช้ยา', 'อายุและอาการร่วม', 'ประวัติการตรวจหรือคำแนะนำจากสัตวแพทย์'],
    };
    result.thread = {
      common: [item('คอมเมนต์พูดถึงการทายาและการหาข้อมูลจากคลินิก', ['S1-c1', 'S1-c2', 'S1-c3'])],
      differences: [item('คอมเมนต์หนึ่งเสนอให้เปลี่ยนยาตามแมวอีกตัว ส่วนอีกคอมเมนต์แชร์ประสบการณ์เข้าตรวจ', ['S1-c1', 'S1-c2'])],
      unanswered: [{ id: 'rash-details', text: 'ยังไม่ทราบชื่อยา ระยะเวลาที่ใช้ และผลการตรวจ', question: 'แมวมีผื่นและทายาแล้วยังไม่ดีขึ้น ควรเตรียมชื่อยา ลำดับอาการ และข้อมูลใดให้สัตวแพทย์ประเมินต่อ?', commentIds: ['S1-c1', 'S1-c2'] }],
    };
    const comments = cleanComments(post);
    const expected = [
      ['S1-c1', 'ทายาแล้วไม่ดีขึ้น แปลว่ายาไม่ดี', 4, 'ผลที่ยังไม่ดีขึ้นเพียงอย่างเดียวยังไม่พอสรุปคุณภาพยา เพราะข้อมูลชื่อยา วิธีใช้ ระยะเวลา และการประเมินเคสยังขาด', 'แก้เฉพาะข้อสรุปเรื่องคุณภาพยา ไม่ได้ยืนยันว่ายาดีหรือเหมาะกับเคสนี้'],
      ['S1-c1', 'ลองเปลี่ยนตามที่คนอื่นเคยใช้', 5, 'ไม่มีข้อมูลเคสหรือหลักฐานที่ทีมอนุมัติรองรับการเลือกยาตามแมวอีกตัว', 'ใช้เป็นประเด็นถามสัตวแพทย์ ไม่ใช้เลือกหรือเปลี่ยนยาเอง'],
      ['S1-c2', 'ของที่บ้านเคยมีรอยคล้ายกัน แต่ให้คลินิกตรวจถึงรู้สาเหตุ', 2, 'เป็นคำบอกเล่าประสบการณ์ของแมวอีกตัว ไม่มีผลตรวจของเคสในโพสต์', 'ช่วยให้เห็นทางเลือกในการสอบถามคลินิก แต่ยืนยันสาเหตุของเคสนี้ไม่ได้'],
      ['S1-c3', 'เตรียมชื่อยาที่ใช้และวันที่เริ่มมีผื่นไปถามคลินิก', 1, 'เป็นขั้นตอนรวบรวมข้อมูลเพื่อให้คำถามชัดเจน โดยไม่ได้สรุปโรคหรือเลือกยา', 'ใช้สำหรับเตรียมการสนทนากับคลินิก ไม่ใช่คำแนะนำการรักษา'],
    ];
    result.claims = expected.filter(([id, quote]) => comments.some(c => c.id === id && c.text.includes(quote))).map(([commentId, quote, status, reason, scope]) => ({ commentId, quote, status, reason, scope, evidence: [] }));
  }

  if (post.provenance === 'simulated' && post.id === 'S2' && post.text === 'มีคลินิกแมวแถวบ้านแนะนำไหม อยากทราบค่าใช้จ่ายเบื้องต้นและเปิดช่วงเวลาไหนบ้าง') {
    result.summary = {
      happened: 'ผู้โพสต์กำลังหาคลินิกแมวใกล้บ้าน พร้อมข้อมูลค่าใช้จ่ายและเวลาทำการ',
      tried: 'ยังไม่ระบุว่าติดต่อคลินิกใดแล้ว',
      decision: 'จะสอบถามหรือเลือกคลินิกใดภายใต้พื้นที่ เวลา และงบที่เหมาะสม',
      missing: ['พื้นที่ที่ต้องการ', 'บริการที่ต้องการสอบถาม', 'ค่าใช้จ่ายที่ยืนยันกับคลินิก', 'ช่วงเวลาทำการที่ยืนยันกับคลินิก'],
    };
    result.recommendation = {
      answer: 'คอมเมนต์จำลองเสนอชื่อคลินิก แต่ยังไม่มีคำตอบเรื่องค่าใช้จ่ายและเวลาทำการ ใช้รายชื่อเป็นจุดเริ่มต้นติดต่อสอบถามโดยระบุบริการและพื้นที่ก่อน',
      options: [
        { action: 'ระบุพื้นที่และบริการที่ต้องการ แล้วสอบถามแต่ละคลินิกด้วยคำถามชุดเดียวกัน', reason: 'ช่วยเปรียบเทียบค่าใช้จ่ายและเวลาได้ตรงกัน' },
        { action: 'จดวันที่ตรวจสอบข้อมูลและเงื่อนไขค่าใช้จ่ายเพิ่มเติม', reason: 'ราคาและเวลาทำการอาจขึ้นกับบริการและวันนัด ต้องยืนยันจากคลินิก' },
      ],
      comparison: [
        { criterion: 'ค่าใช้จ่าย', check: 'ค่าบริการเริ่มต้น รวมและไม่รวมรายการใด', context: 'ระบุบริการเดียวกันก่อนเทียบราคา' },
        { criterion: 'ช่วงเวลาที่เปิด', check: 'วัน เวลา และการนัดหมายที่คลินิกยืนยัน', context: 'ยืนยันวันที่ต้องการไป ไม่อนุมานจากคอมเมนต์' },
      ],
    };
    result.thread = {
      common: [item('สองคอมเมนต์เสนอคลินิกคนละแห่ง แต่ยังไม่ให้รายละเอียดค่าใช้จ่ายหรือเวลาทำการ', ['S2-c1', 'S2-c2'])],
      differences: [item('แนะนำชื่อคลินิกต่างกัน ยังไม่มีเกณฑ์เปรียบเทียบหรือข้อมูลให้ตัดสินคุณภาพ', ['S2-c1', 'S2-c2'])],
      unanswered: [
        { id: 'clinic-cost', text: 'ยังไม่มีคำตอบเรื่องค่าใช้จ่าย', question: 'ควรถามคลินิกอย่างไรให้ทราบค่าใช้จ่ายเบื้องต้น รายการที่รวม และค่าใช้จ่ายเพิ่มเติมของบริการที่ต้องการ?', commentIds: ['S2-c1', 'S2-c2'] },
        { id: 'clinic-hours', text: 'ยังไม่มีคำตอบเรื่องช่วงเวลาที่เปิดและการนัดหมาย', question: 'ควรยืนยันวันเวลาเปิดและเงื่อนไขการนัดหมายใดกับคลินิกก่อนเดินทาง?', commentIds: ['S2-c1', 'S2-c2'] },
      ],
    };
    result.claims = cleanComments(post).map(c => c.id === 'S2-c1' ? {
      commentId: c.id, quote: c.text, status: 2,
      reason: 'เป็นประสบการณ์การไปใช้บริการส่วนตัว ไม่ได้บอกราคา เวลาทำการ หรือผลที่ใช้เปรียบเทียบ',
      scope: 'ใช้เป็นรายชื่อสำหรับสอบถามต่อ ไม่ใช้รับรองคุณภาพคลินิก', evidence: [],
    } : unknownClaim(c.id, c.text));
  }

  if (post.coverage !== 'complete') result.reviewReasons.push('คอมเมนต์เก็บได้บางส่วนหรือไม่ทราบความครบถ้วน');
  if (!cleanComments(post).length) result.reviewReasons.push('ไม่มีข้อความคอมเมนต์รายรายการ ตรวจข้ออ้างรายคอมเมนต์ไม่ได้');
  validateAnalysis(result, post);
  return result;
}

/**
 * Validate bounded shape + quote/evidence provenance at the server boundary and
 * again before rendering. This does NOT establish semantic clinical safety.
 * A future provider needs a server-side, team-approved clinical policy before
 * it may emit clinical recommendations; a system prompt alone is insufficient.
 */
export function validateAnalysis(value, post) {
  const fail = path => { throw new TypeError(`รูปแบบผลวิเคราะห์ไม่ถูกต้อง: ${path}`); };
  let totalCharacters = 0;
  let totalArrayItems = 0;
  const obj = (x, path) => { if (!x || typeof x !== 'object' || Array.isArray(x)) fail(path); return x; };
  const str = (x, path, max = 20000) => {
    if (typeof x !== 'string' || !x.trim() || x.length > max) fail(path);
    totalCharacters += x.length;
    if (totalCharacters > 1_000_000) fail('combined text exceeds 1,000,000 characters');
  };
  const arr = (x, path, max = 2000) => {
    if (!Array.isArray(x) || x.length > max) fail(path);
    totalArrayItems += x.length;
    if (totalArrayItems > 12000) fail('combined arrays exceed 12,000 items');
    return x;
  };
  obj(value, 'result');
  if (value.version !== 1 || !['demo', 'ai'].includes(value.mode)) fail('version / mode');
  obj(value.summary, 'summary');
  for (const key of ['happened', 'tried', 'decision']) str(value.summary[key], `summary.${key}`);
  arr(value.summary.missing, 'summary.missing', 100).forEach((x, i) => str(x, `summary.missing[${i}]`));
  obj(value.recommendation, 'recommendation');
  str(value.recommendation.answer, 'recommendation.answer');
  arr(value.recommendation.options, 'recommendation.options', 100).forEach((x, i) => {
    obj(x, `recommendation.options[${i}]`); str(x.action, 'option.action'); str(x.reason, 'option.reason');
  });
  if (value.recommendation.comparison !== undefined) arr(value.recommendation.comparison, 'comparison', 100).forEach(x => {
    obj(x, 'comparison row'); for (const key of ['criterion', 'check', 'context']) str(x[key], `comparison.${key}`);
  });
  const comments = cleanComments(post);
  const commentMap = new Map(comments.map(c => [c.id, c.text]));
  const refs = (ids, path) => arr(ids, path, 2000).forEach(id => { str(id, `${path}.id`, 200); if (!commentMap.has(id)) fail(path); });
  obj(value.thread, 'thread');
  for (const key of ['common', 'differences', 'unanswered']) arr(value.thread[key], `thread.${key}`, 100).forEach((x, i) => {
    obj(x, `thread.${key}[${i}]`); str(x.text, 'thread.text'); refs(x.commentIds, 'thread.commentIds');
    if (key === 'unanswered') { str(x.id, 'unanswered.id', 200); str(x.question, 'unanswered.question'); }
  });
  arr(value.claims, 'claims').forEach(x => {
    obj(x, 'claim');
    if (!commentMap.has(x.commentId)) fail('claim.commentId');
    str(x.quote, 'claim.quote');
    if (!commentMap.get(x.commentId).includes(x.quote)) fail('claim.quote must occur in original comment');
    if (!Number.isInteger(x.status) || !CLAIM_STATUSES[x.status]) fail('claim.status');
    str(x.reason, 'claim.reason'); str(x.scope, 'claim.scope');
    arr(x.evidence, 'claim.evidence', 100).forEach(e => {
      obj(e, 'evidence');
      const approved = APPROVED_EVIDENCE.find(source => source.id === e.id);
      if (!approved || e.url !== approved.url || e.title !== approved.title) fail('evidence is not team-approved');
    });
    if (x.status === 3 && !x.evidence.length) fail('status 3 requires approved evidence');
  });
  arr(value.reviewReasons, 'reviewReasons', 100).forEach(x => str(x, 'reviewReason'));
  return value;
}

export function makeHandoff(post, analysis, selectedQuestion) {
  validateAnalysis(analysis, post);
  const question = typeof selectedQuestion === 'string' && selectedQuestion.trim()
    ? selectedQuestion.trim()
    : selectedQuestion?.id==='generic-context' ? '' : selectedQuestion?.question || analysis.thread.unanswered.find(item=>item.id!=='generic-context')?.question || '';
  const context=analysis.summary.happened.replace(/^ข้อความต้นทางระบุ:\s*/u,'');
  const tried=analysis.summary.tried;
  const differences=analysis.thread.differences.map(x=>x.text).filter(x=>!/^ยังไม่|^ไม่มี|^ไม่พบ/u.test(x));
  const missing=analysis.summary.missing.filter(x=>!/คอมเมนต์|รายละเอียดที่ผู้โพสต์/u.test(x));
  return [
    `อยากสอบถามเรื่องนี้เพิ่มเติม ${context}`,
    !/ไม่ทราบ|ไม่ได้บอก|ระบุไม่ครบ|ไม่มีข้อมูล/u.test(tried)?`สิ่งที่ลองทำไปแล้วคือ ${tried}`:'',
    differences.length?`อีกเรื่องที่ยังอยากทำความเข้าใจคือ ${differences.join(' และ ')}`:'',
    missing.length?`รายละเอียดที่ยังไม่ทราบมีเรื่อง${missing.join(' รวมถึง')} จึงอาจต้องเติมข้อมูลส่วนนี้ก่อน`:'',
    post.commentSummary&&!cleanComments(post).length?'ส่วนความเห็นของสมาชิกที่มีเป็นเพียงสรุปถอดความ ยังไม่ได้อ่านข้อความรายคอมเมนต์':cleanComments(post).length&&post.coverage!=='complete'?'อ้างอิงจากคอมเมนต์ที่เก็บได้บางส่วนเท่านั้น':'' ,
    question,
  ].filter(Boolean).join('\n\n');
}
