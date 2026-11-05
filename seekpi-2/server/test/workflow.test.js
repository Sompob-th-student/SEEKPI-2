import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedActions, canTransition, canInput, firstStage, KPI_STAGES } from '../workflow.js';

const OWNER = { owner: true }, EVAL = { evaluator: true }, ADMIN = { admin: true };
const codes = (a) => a.map((x) => x.to);

test('KPI structures have the 11 stages of the original plus End to Horizontal', () => {
  assert.equal(KPI_STAGES.length, 12);
  assert.equal(firstStage('Quantity'), 'APPROVE_ITEM');
  assert.equal(firstStage('Quality'), 'APPRAISAL');
});

test('owner can save draft or send for review once items are approved', () => {
  assert.deepEqual(codes(allowedActions('Quantity', 'APPROVE_ITEM', OWNER)), ['SAVE_DRAFT_ACTUAL', 'REVIEW_ACTUAL', 'REJECT_ITEM']);
  assert.equal(canInput('Quantity', 'SAVE_DRAFT_ACTUAL'), true);
  assert.equal(canInput('Quantity', 'REVIEW_ACTUAL'), false);
});

test('only the evaluator approves or rejects a submitted result', () => {
  assert.deepEqual(codes(allowedActions('Quantity', 'REVIEW_ACTUAL', OWNER)), []);
  assert.deepEqual(codes(allowedActions('Quantity', 'REVIEW_ACTUAL', EVAL)), ['APPROVE_ACTUAL', 'REJECT_ACTUAL']);
});

test('admin steps and closing', () => {
  assert.equal(canTransition('Quantity', 'APPROVE_ACTUAL', 'ADMIN_APPROVE_ACTUAL', EVAL), false);
  assert.equal(canTransition('Quantity', 'APPROVE_ACTUAL', 'ADMIN_APPROVE_ACTUAL', ADMIN), true);
  assert.equal(canTransition('Quantity', 'ADMIN_APPROVE_ACTUAL', 'END_TO_VERTICAL', ADMIN), true);
  assert.deepEqual(codes(allowedActions('Quantity', 'END_TO_HORIZONTAL', ADMIN)), []);
});

test('competency flow', () => {
  assert.deepEqual(codes(allowedActions('Quality', 'APPRAISAL', EVAL)), ['SAVE_DRAFT_APPRAISAL', 'SUBMIT']);
  assert.equal(canTransition('Quality', 'SUBMIT', 'APPROVE', EVAL), false);
  assert.equal(canTransition('Quality', 'SUBMIT', 'APPROVE', ADMIN), true);
});
