/** Offline OOXML import. No formulas, HTML, macros or embedded instructions execute. */
const MAX_FILE = 25 * 1024 * 1024;
const MAX_EXPANDED = 80 * 1024 * 1024;
const MAX_ROWS = 15000;
const decoder = new TextDecoder('utf-8');
const clean = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();
const unique = values => [...new Set(values.filter(v=>v !== undefined && v !== null && v !== ''))];
const hash = value => { let h = 2166136261; for (const ch of value) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const decodeXml = value => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code) => {
  if (code[0] === '#') { const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd'; }
  return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[code.toLowerCase()];
});
const attrs = value => Object.fromEntries([...value.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1], decodeXml(m[2] ?? m[3])]));
function elements(xml, name) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*?)(?:\\/\\s*>|>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}\\s*>)`, 'g');
  return [...xml.matchAll(re)].map(m => ({attributes: attrs(m[1]), body:m[2] ?? ''}));
}
const xmlText = xml => elements(xml, 't').map(t => decodeXml(t.body.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))).join('');
function resolvePath(base, target) {
  const parts = (target.startsWith('/') ? target.slice(1) : `${base}/${target}`).split('/');
  const result = [];
  for (const part of parts) { if (!part || part === '.') continue; if (part === '..') result.pop(); else result.push(part); }
  return result.join('/');
}
async function openZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.byteLength || bytes.byteLength > MAX_FILE) throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 25 MB');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('อ่านไฟล์ไม่ได้ กรุณาเลือกไฟล์ Excel .xlsx ที่ไม่เข้ารหัส');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('ไม่รองรับ Excel แบบ ZIP หลายส่วน');
  const count = view.getUint16(end + 10, true);
  let position = view.getUint32(end + 16, true), expanded = 0;
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (position + 46 > bytes.length || view.getUint32(position, true) !== 0x02014b50) throw new Error('โครงสร้างไฟล์ Excel ไม่สมบูรณ์');
    const flags = view.getUint16(position + 8, true), method = view.getUint16(position + 10, true);
    const size = view.getUint32(position + 20, true), unpacked = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true), extraLength = view.getUint16(position + 30, true), commentLength = view.getUint16(position + 32, true);
    const offset = view.getUint32(position + 42, true);
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    expanded += unpacked;
    if (expanded > MAX_EXPANDED || size === 0xffffffff || unpacked === 0xffffffff) throw new Error('ข้อมูลในไฟล์ใหญ่เกินขนาดที่รองรับ');
    if (flags & 1) throw new Error('กรุณาใช้ไฟล์ Excel ที่ไม่ตั้งรหัสผ่าน');
    entries.set(name, {method,size,unpacked,offset});
    position += 46 + nameLength + extraLength + commentLength;
  }
  return async path => {
    const e = entries.get(path);
    if (!e) return null;
    if (e.offset + 30 > bytes.length || view.getUint32(e.offset, true) !== 0x04034b50) throw new Error('ข้อมูล ZIP ไม่สมบูรณ์');
    const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
    if (start + e.size > bytes.length) throw new Error('ข้อมูล Excel ถูกตัดขาด');
    const data = bytes.subarray(start, start + e.size);
    let result;
    if (e.method === 0) result = data;
    else if (e.method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('เบราว์เซอร์นี้อ่าน Excel ไม่ได้ กรุณาใช้ Chrome หรือ Edge รุ่นปัจจุบัน');
      const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const parts = []; let length = 0;
      while (true) { const {done,value} = await reader.read(); if (done) break; length += value.length; if (length > e.unpacked || length > MAX_EXPANDED) { await reader.cancel(); throw new Error('ขนาดข้อมูล Excel ไม่ตรงกับไฟล์'); } parts.push(value); }
      result = new Uint8Array(length); let cursor = 0; for (const part of parts) { result.set(part,cursor); cursor += part.length; }
    } else throw new Error('รูปแบบการบีบอัด Excel นี้ยังไม่รองรับ');
    if (result.length !== e.unpacked) throw new Error('ข้อมูล Excel ไม่สมบูรณ์');
    const xml = decoder.decode(result);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('ไม่รองรับ XML ที่ประกาศ entity ภายนอก');
    return xml;
  };
}
function columnNumber(ref) { let n = 0; for (const c of (ref.match(/^[A-Z]+/i)?.[0] || 'A').toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; }
const normal = text => clean(text).toLowerCase().replace(/[\s_()（）:.-]/g, '');
const fieldRules = {
  postId:[/^postid$/, /^postidentifier$/, /^รหัสโพสต์$/, /^ไอดีโพสต์$/],
  category:[/^category$/, /^หมวด/, /^ประเภทโพสต์$/, /^คำค้นที่พบ$/],
  text:[/^text$/, /^posttext$/, /^postcontent$/, /^ข้อความโพสต์/, /^ข้อความตัดตอนที่เห็นในหน้าโพสต์/, /^เนื้อหาโพสต์/, /^สรุปโพสต์/, /^ประเด็นในโพสต์/],
  url:[/^url$/, /^posturl$/, /^sourceurl$/, /^urlโพสต์/, /^ลิงก์ต้นทาง/, /^ลิงก์โพสต์/, /^แหล่งข้อมูลurl/],
  comment:[/^comment$/, /^commenttext$/, /^ข้อความคอมเมนต์/, /^คอมเมนต์$/],
  summary:[/^commentsummary$/, /^สรุปคอมเมนต์/, /^สิ่งที่สมาชิกตอบ\/แชร์/],
  coverage:[/^coverage$/, /^commentcoverage$/, /^สถานะคอมเมนต์/, /^ความครบถ้วน/]
};
export function suggestMapping(headers) {
  const mapping = {};
  for (const [key,rules] of Object.entries(fieldRules)) mapping[key] = headers.find(h => rules.some(rule => rule.test(normal(h)))) || '';
  return mapping;
}
function headerScore(values) {
  const populated = values.filter(v => clean(v));
  const mapping = suggestMapping(populated);
  const matched = Object.values(mapping).filter(Boolean).length;
  const averageLength = populated.reduce((n,v)=>n+v.length,0) / Math.max(1,populated.length);
  return (matched >= 2 ? matched * 20 : 0) + Math.min(populated.length, 12) * 3 - averageLength / 20;
}
export async function readWorkbook(input) {
  const read = await openZip(input);
  const workbook = await read('xl/workbook.xml'), relationships = await read('xl/_rels/workbook.xml.rels');
  if (!workbook || !relationships) throw new Error('ไม่พบ workbook ในไฟล์ กรุณาเลือก Excel .xlsx');
  const links = Object.fromEntries(elements(relationships,'Relationship').filter(r => r.attributes.TargetMode !== 'External').map(r => [r.attributes.Id,resolvePath('xl',r.attributes.Target)]));
  const shared = (await read('xl/sharedStrings.xml')) || '';
  const strings = elements(shared,'si').map(si => xmlText(si.body));
  const sheets = [];
  for (const sheet of elements(workbook,'sheet')) {
    const path = links[sheet.attributes['r:id']];
    if (!path) continue;
    const xml = await read(path); if (!xml) continue;
    const rawRows = elements(xml,'row');
    if (rawRows.length > MAX_ROWS) throw new Error('รองรับไม่เกิน 15,000 แถวต่อชีต');
    const table = [];
    for (const row of rawRows) {
      const values = [];
      for (const cell of elements(row.body,'c')) {
        const col = columnNumber(cell.attributes.r || 'A');
        if (col > 500) continue;
        const raw = elements(cell.body,'v')[0]?.body ?? '';
        let value = cell.attributes.t === 's' ? (strings[Number(raw)] || '') : cell.attributes.t === 'inlineStr' ? xmlText(cell.body) : decodeXml(raw);
        // Formula cached values are data only. Formulas are never evaluated.
        values[col] = clean(value);
      }
      if (values.some(Boolean)) table.push({values,rowNumber:Number(row.attributes.r) || table.length + 1});
    }
    let best = 0;
    for (let i = 1; i < Math.min(table.length, 30); i++) if (headerScore(table[i].values) > headerScore(table[best].values)) best = i;
    const header = table[best] || {values:[],rowNumber:1};
    const seen = new Map();
    const headers = Array.from({length:header.values.length}, (_,i) => {
      const name = header.values[i] || `คอลัมน์ ${i + 1}`; const n = (seen.get(name) || 0) + 1; seen.set(name,n); return n === 1 ? name : `${name} (${n})`;
    });
    const rows = table.slice(best + 1).map(row => {
      const object = Object.create(null);
      for (let i = 0; i < headers.length; i++) object[headers[i]] = row.values[i] || '';
      Object.defineProperty(object,'__rowNumber',{value:row.rowNumber,enumerable:false});
      return object;
    });
    sheets.push({name:sheet.attributes.name,headers,rows,headerRow:header.rowNumber});
  }
  if (!sheets.length) throw new Error('ไม่พบชีตที่อ่านได้ในไฟล์');
  return {sheets,warnings:[]};
}
export function canonicalPostUrl(value) {
  try {
    const url = new URL(clean(value));
    if (!['http:','https:'].includes(url.protocol)) return '';
    if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return '';
    const match = url.pathname.match(/\/groups\/([^/]+)\/(?:posts|permalink)\/([^/]+)/i);
    if (match) return `https://www.facebook.com/groups/${match[1]}/posts/${match[2]}`;
    const story = url.searchParams.get('story_fbid');
    if (story) return `https://www.facebook.com/story.php?story_fbid=${encodeURIComponent(story)}`;
    const post = url.pathname.match(/\/posts\/([^/]+)/i);
    if (post) return `https://www.facebook.com/posts/${post[1]}`;
    if (/^\/share\/p\/[^/]+\/?$/i.test(url.pathname)) return `https://www.facebook.com${url.pathname.replace(/\/$/,'')}`;
    return '';
  } catch { return ''; }
}
function keysFor(post) {
  const url = canonicalPostUrl(post.url), postId = clean(post.postId);
  const keys = [...(post.identityKeys || [])];
  if (postId) keys.push(`id:${postId}`);
  if (url) {
    keys.push(`url:${url}`);
    if (/facebook\.com\//i.test(url)) {
      const id = url.match(/\/(?:posts|permalink)\/([^/?]+)/)?.[1] || new URL(url).searchParams.get('story_fbid');
      if (id) keys.push(`id:${id}`);
    }
  }
  return unique(keys);
}
function coverageOf(value, mapping) {
  const v = clean(value).toLowerCase();
  if (/partial|บางส่วน|ไม่ครบ|อ่านได้บาง|เก็บได้บาง|มีตัวอย่าง/.test(v)) return 'partial';
  if (/^complete$|^ครบ$|ครบทั้งหมด|ครบทุก/.test(v)) return 'complete';
  if (/ที่อ่านได้|ที่เก็บได้/.test(mapping.summary || '')) return 'partial';
  return 'unknown';
}
function mergePosts(a,b) {
  const commentMap = new Map();
  for (const c of [...(a.comments || []),...(b.comments || [])]) if (clean(c.text) && !commentMap.has(clean(c.text))) commentMap.set(clean(c.text),c);
  const summaries = unique([...(a.commentSummaries || [a.commentSummary]),...(b.commentSummaries || [b.commentSummary])]);
  const importSources = new Map();
  for (const source of [...(a.importSources?.length ? a.importSources : [a]),...(b.importSources?.length ? b.importSources : [b])]) if (source.fileName) {
    const key=`${source.fileName}|${source.sheetName || ''}`;
    const prior=importSources.get(key);
    importSources.set(key,{fileName:source.fileName,sheetName:source.sheetName || '',rowNumbers:unique([...(prior?.rowNumbers || []),...(source.rowNumbers || [])])});
  }
  // Keep the uploaded source versions intact. This differs from importSources,
  // which tracks files containing comments even when they have no post text.
  const variants = new Map();
  for (const source of [...(a.sourceVariants || []),a,...(b.sourceVariants || []),b]) if (source.text) {
    const variant = {
      text:source.text,category:source.category || 'ยังไม่จัดหมวด',provenance:source.provenance || 'imported',
      postTextKind:source.postTextKind || (source.provenance === 'paraphrased' ? 'paraphrased' : 'original'),
      sourceLabel:source.sourceLabel || '',fileName:source.fileName || '',sheetName:source.sheetName || '',rowNumbers:[...(source.rowNumbers || [])]
    };
    const key=JSON.stringify({...variant,rowNumbers:[]});
    const prior=variants.get(key);
    if (prior) variant.rowNumbers=unique([...prior.rowNumbers,...variant.rowNumbers]);
    variants.set(key,variant);
  }
  const textSource=b.text ? b : a;
  const chosenKind=textSource.postTextKind || (textSource.provenance === 'paraphrased' ? 'paraphrased' : 'original');
  const merged = {...a,postId:a.postId || b.postId,category:b.category && b.category !== 'ยังไม่จัดหมวด' ? b.category : a.category,text:textSource.text || '',url:a.url || b.url,
    comments:[...commentMap.values()],commentSummary:summaries.join('\n'),commentSummaries:summaries,
    title:b.title || (b.text && b.text !== a.text ? undefined : a.title),
    fileName:textSource.fileName || '',sheetName:textSource.sheetName || '',sourceLabel:textSource.sourceLabel || '',
    importSources:[...importSources.values()],sourceVariants:[...variants.values()],provenance:textSource.provenance,
    coverage:a.coverage === 'partial' || b.coverage === 'partial' ? 'partial' : a.coverage === 'complete' && b.coverage === 'complete' ? 'complete' : 'unknown',
    identityKeys:unique([...keysFor(a),...keysFor(b)]),rowNumbers:[...(textSource.rowNumbers || [])],
    postTextKind:chosenKind,readingMode:textSource.readingMode,sourceNote:textSource.sourceNote,accessStatus:textSource.accessStatus};
  merged.canReviewComments = merged.comments.length > 0;
  merged.commentDataNote = merged.canReviewComments || merged.commentSummary ? '' : (a.commentDataNote || b.commentDataNote || '');
  merged.missing = missingFor(merged);
  return merged;
}
function missingFor(post) {
  const result=[];
  if (!post.text) result.push('ข้อความโพสต์');
  if (!canonicalPostUrl(post.url)) result.push('ลิงก์ต้นทาง');
  if (!post.postId && !canonicalPostUrl(post.url)) result.push('รหัสสำหรับรวมโพสต์');
  if (!post.category || post.category === 'ยังไม่จัดหมวด') result.push('หมวด');
  if (!post.comments.length && !post.commentSummary) result.push('ข้อมูลคอมเมนต์');
  return result;
}
export function previewImport(rows,mapping,existingPosts=[],options={}) {
  if (!mapping?.text) throw new Error('กรุณาเทียบคอลัมน์ข้อความโพสต์ก่อน');
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new Error('จำนวนแถวไม่อยู่ในขอบเขตที่รองรับ');
  const candidates=[]; const index=new Map(); const issues=[]; let usedRows=0;
  const paraphrasedComment = /สรุป|ถอดความ|summary|paraphras/i.test(mapping.comment || '');
  if (paraphrasedComment) issues.push({type:'paraphrased',message:'คอลัมน์คอมเมนต์เป็นข้อมูลถอดความ จัดเก็บเป็นสรุปและไม่เปิดตรวจรายคอมเมนต์'});
  for (let i=0;i<rows.length;i++) {
    const row=rows[i], get=key => clean(mapping[key] ? row[mapping[key]] : '');
    const text=get('text'), url=get('url'), postId=get('postId'), comment=get('comment'), rawSummary=get('summary');
    const unavailable = /^(?:ไม่แสดง(?:ข้อความ|รายละเอียด)?คอมเมนต์|ยังไม่พบข้อความ|ไม่มีคอมเมนต์ที่ยืนยัน|ไม่พบคอมเมนต์|ไม่บันทึก)/.test(rawSummary);
    const summary = unavailable ? '' : rawSummary;
    if (![text,url,postId,comment,summary].some(Boolean)) continue;
    usedRows++;
    const rowNumber=row.__rowNumber || i+2;
    const comments=comment && !paraphrasedComment ? [{id:`c-${hash(`${postId}|${url}|${comment}`)}`,text:comment}] : [];
    const post={id:'',postId,category:get('category') || 'ยังไม่จัดหมวด',text,url,comments,
      commentSummary:unique([summary,paraphrasedComment ? comment : '']).join('\n'),coverage:coverageOf(get('coverage'),mapping),
      provenance:/ถอดความ|สรุป|paraphras|summary/i.test(mapping.text) ? 'paraphrased' : 'imported',sourceLabel:'นำเข้าจาก Excel',fileName:options.fileName || '',sheetName:options.sheetName || '',
      postTextKind:/ถอดความ|สรุป|paraphras|summary/i.test(mapping.text) ? 'paraphrased' : 'original',
      canReviewComments:comments.length>0,commentDataNote:unavailable ? rawSummary : '',missing:[],identityKeys:[],rowNumbers:[rowNumber]};
    post.identityKeys=keysFor(post);
    post.id=`import-${hash(post.identityKeys[0] || `${options.fileName}|${options.sheetName}|${rowNumber}|${text}`)}`;
    if (!post.identityKeys.length) post.identityKeys=[`unkeyed:${post.id}`];
    post.missing=missingFor(post);
    const matches=unique(post.identityKeys.map(k=>index.get(k)).filter(n=>n !== undefined));
    let n;
    if (!matches.length) { n=candidates.length; candidates.push(post); }
    else {
      n=matches[0]; candidates[n]=mergePosts(candidates[n],post);
      // A bridge row may expose aliases used by two earlier groups.
      for (const other of matches.slice(1)) { if (!candidates[other]) continue; candidates[n]=mergePosts(candidates[n],candidates[other]); candidates[other]=null; for (const [key,value] of index) if (value === other) index.set(key,n); }
    }
    for (const key of candidates[n].identityKeys) index.set(key,n);
  }
  const posts=candidates.filter(Boolean), existingIndex=new Map();
  for (const existing of existingPosts) for (const key of keysFor(existing)) if (!existingIndex.has(key)) existingIndex.set(key,existing);
  const newPosts=[];
  for (const post of posts) {
    const existing=post.identityKeys.map(k=>existingIndex.get(k)).find(Boolean);
    if (!existing) { newPosts.push(post); continue; }
    // Preview IDs are the IDs that commitImport will preserve. UI selection,
    // import-round links and analysis invalidation therefore refer to real posts.
    post.id=existing.id;
    post.postId=post.postId || existing.postId || '';
    const oldComments=new Map((existing.comments || []).map(c=>[clean(c.text),c]));
    post.comments=post.comments.map(c=>oldComments.get(clean(c.text)) || c);
  }
  const duplicateCount=posts.length-newPosts.length;
  const missingCount=posts.filter(p=>p.missing.length).length;
  for (const post of posts) if (post.missing.length) issues.push({type:'missing',postId:post.id,rows:post.rowNumbers,message:`แถว ${post.rowNumbers.join(', ')}: ขาด${post.missing.join(', ')}`});
  return {posts,newPosts,newCount:newPosts.length,duplicateCount,mergedRowCount:usedRows-posts.length,missingCount,issues,rowCount:usedRows};
}
export function commitImport(existingPosts,preview) {
  const result=existingPosts.map(p=>({...p,comments:[...(p.comments || [])],identityKeys:keysFor(p)}));
  const index=new Map(); result.forEach((post,i)=>post.identityKeys.forEach(k=>{if(!index.has(k))index.set(k,i);}));
  for (const candidate of preview.posts) {
    const matches=unique(candidate.identityKeys.map(k=>index.get(k)));
    const n=matches.length ? matches[0] : result.length;
    if (!matches.length) result.push(candidate); else result[n]=mergePosts(result[n],candidate);
    for (const other of matches.slice(1)) { if (!result[other]) continue; result[n]=mergePosts(result[n],result[other]); result[other]=null; for (const [key,value] of index) if (value === other) index.set(key,n); }
    for (const key of result[n].identityKeys) index.set(key,n);
  }
  return result.filter(Boolean);
}
