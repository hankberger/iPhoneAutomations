import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { findAutomation } from '../src/catalog.js';
import { cherriSource } from '../scripts/build-shortcuts.mjs';
import { verifyMealWorkflow } from '../scripts/shortcut-validation.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/meal-workflow.json', import.meta.url)));
test('shipped meal shortcut matches its source, signature artifact and reviewed Health quantities', () => {
  const a = findAutomation('snap-calories');
  assert.equal(a.icloudUrl, undefined, 'Do not ship the obsolete no-review iCloud link');
  assert.equal(a.recipeVersion, 2);
  const source = cherriSource(a);
  assert.match(source, /"recipe_version": 2/);
  const signed = readFileSync(new URL('../public/shortcuts/snap-calories.shortcut', import.meta.url));
  assert.equal(signed.subarray(0, 4).toString(), 'AEA1');
  const sha = value => createHash('sha256').update(value).digest('hex');
  assert.equal(fixture.sourceSHA256, sha(source), 'Rebuild the meal shortcut after changing source');
  assert.equal(fixture.signedSHA256, sha(signed), 'Audit fixture must match the shipped signed file');
  verifyMealWorkflow(fixture.workflow);
});

test('meal artifact guard rejects missing cancel, unreviewed writes, changed values and missing units', () => {
  for (const mutate of [
    (w, i) => { w.WFWorkflowActions[i].WFWorkflowActionParameters.WFAlertActionCancelButtonShown = false; },
    (w, i) => { const [write] = w.WFWorkflowActions.splice(i + 1, 1); w.WFWorkflowActions.unshift(write); },
    (w, i) => { w.WFWorkflowActions[i + 1].WFWorkflowActionParameters.WFQuantitySampleQuantity.Value.Magnitude.Value.OutputUUID = 'wrong-value'; },
    (w, i) => { delete w.WFWorkflowActions[i + 1].WFWorkflowActionParameters.WFQuantitySampleQuantity.Value.Unit; },
  ]) {
    const workflow = structuredClone(fixture.workflow);
    const i = workflow.WFWorkflowActions.findIndex(a => a.WFWorkflowActionParameters?.WFAlertActionTitle === 'Review before saving to Health');
    mutate(workflow, i);
    assert.throws(() => verifyMealWorkflow(workflow));
  }
});
