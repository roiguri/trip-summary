// Which edits are accepted (lib/edits.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEdit } from '../../lib/edits.ts';

test('the fields edit mode changes are accepted with their kind of value', () => {
  for (const e of [
    { target: 'entry', key: '7', field: 'title', value: 'The beach' },
    { target: 'entry', key: '7', field: 'start_time', value: '09:28' },
    { target: 'entry', key: '7', field: 'start_time', value: '' },
    { target: 'entry', key: '7', field: 'highlighted', value: true },
    { target: 'entry', key: '7', field: 'mode', value: 'train' },
    { target: 'entry', key: '7', field: 'visit', value: 'visit:2026-05-15T16:28:00.000Z:ChIJx' },
    { target: 'entry', key: '7', field: 'visit', value: 'none' },
    { target: 'entry', key: '7', field: 'proposal', value: 'ignored' },
    { target: 'photo', key: 'm1', field: 'entry', value: '7' },
    { target: 'photo', key: 'm1', field: 'entry', value: null },
    { target: 'suggestion', key: 's', field: 'times', value: '16:30-17:25' },
    { target: 'suggestion', key: 's', field: 'times', value: 'none' },
    { target: 'day', key: '2026-05-15', field: 'title', value: 'Carmel' },
    { target: 'trip', key: 't', field: 'cover', value: 'm1' },
  ] as const)
    assert.equal(checkEdit(e), null, `${e.target}.${e.field}`);
});

test('an edit with no value undoes it', () => {
  assert.equal(checkEdit({ target: 'entry', key: '7', field: 'title', value: undefined }), null);
});

test('anything else is refused', () => {
  for (const e of [
    { target: 'entry', key: '7', field: 'place_id', value: 3 },
    { target: 'entry', key: '7', field: 'start_time', value: '25:00' },
    { target: 'entry', key: '7', field: 'mode', value: 'rocket' },
    { target: 'entry', key: '7', field: 'hidden', value: 'yes' },
    { target: 'entry', key: '7', field: 'title', value: 'x'.repeat(201) },
    { target: 'entry', key: '', field: 'title', value: 'x' },
    { target: 'entry', key: '7', field: 'title', value: null },
    { target: 'nope', key: '7', field: 'title', value: 'x' },
  ] as const)
    assert.notEqual(checkEdit(e as never), null, JSON.stringify(e));
});
