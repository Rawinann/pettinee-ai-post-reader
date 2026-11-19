import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicPosts,publishableText} from '../hosting/post-texts.mjs';
test('publication strips contacts and reviewed identifiers while preserving times, ages and amounts',()=>{
 const source='พี่ส้ม อายุ 2 เดือน หลังทำหมันวันที่ 5–6 ค่าตรวจ 1500 บาท โทร 0891234567 test@example.com @owner https://facebook.com/private';
 const result=publishableText(source);
 assert.match(result,/อายุ 2 เดือน หลังทำหมันวันที่ 5–6 ค่าตรวจ 1500 บาท/);
 assert.doesNotMatch(result,/พี่ส้ม|0891234567|test@example.com|@owner|facebook.com/);
 assert.match(publishableText('ไป รพ เกษตร มา'),/\[สถานพยาบาล\]/);
});
test('only nonempty post text is selected; source IDs, URLs, categories and comments are not copied',()=>{
 const [post]=createPublicPosts([{postId:'original-facebook-id',url:'https://facebook.com/source',category:'private-category',text:'หลังทำหมัน 5 วัน แผลยังดูบวม',comments:[{text:'not for publication'}],sourceNote:'private metadata'},{text:''},{text:'  '}]);
 assert.equal(post.id,'published-001');assert.equal(post.category,'ทำหมันและแผล');assert.equal(post.postId,'');assert.equal(post.url,'');assert.deepEqual(post.comments,[]);
 assert.doesNotMatch(JSON.stringify(post),/original-facebook-id|facebook.com|private-category|not for publication|private metadata/);
 assert.equal(post.readingMode,'post-only');assert.equal(post.postTextKind,'excerpt');
});
