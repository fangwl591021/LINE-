import assert from 'node:assert/strict';
import { cardHasBusinessIntent, cardUploaderId } from '../worker/card-uploader-match.mjs';

assert.equal(cardUploaderId({ owner_user_id: 'U_OWNER', creator_id: 'U_CREATOR' }), 'U_OWNER');
assert.equal(cardUploaderId({ creator_id: 'U_CREATOR' }), 'U_CREATOR');
assert.equal(cardUploaderId({}), '');

assert.equal(cardHasBusinessIntent({ custom_config: JSON.stringify({ businessIntent: { seek: '日本經銷商' } }) }), true);
assert.equal(cardHasBusinessIntent({ custom_config: JSON.stringify({ businessIntent: { offer: '', seek: '', collaboration: '' } }) }), false);
assert.equal(cardHasBusinessIntent({ custom_config: '{invalid' }), false);

console.log('Card uploader match tests passed.');
