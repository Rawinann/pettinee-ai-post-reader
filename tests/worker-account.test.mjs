import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWorkerAccount,readWorkerAccount} from '../cloud/worker-account.mjs';

test('worker account survives quotes and Thai text in a Node env file',()=>{
 const account='Pettinee "เพทที่นี่" ปรึกษาสัตวแพทย์ออนไลน์';
 const encoded=encodeWorkerAccount(account);
 assert.match(encoded,/^[A-Za-z0-9_-]+$/u);
 assert.equal(readWorkerAccount({CLOUD_FACEBOOK_ACCOUNT_B64:encoded}),account);
 assert.equal(readWorkerAccount({CLOUD_FACEBOOK_ACCOUNT:'Personal Admin'}),'Personal Admin');
 assert.throws(()=>readWorkerAccount({CLOUD_FACEBOOK_ACCOUNT_B64:'?'}));
});
