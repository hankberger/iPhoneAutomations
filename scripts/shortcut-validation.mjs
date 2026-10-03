import assert from 'node:assert/strict';

// Inspect compiled actions, not just source keywords. This is a structural safety
// check; cancel behavior and Health permissions still need an iPhone run.
export function verifyMealWorkflow(workflow) {
  const actions = workflow.WFWorkflowActions;
  assert.ok(Array.isArray(actions), 'Missing compiled actions');
  const review = actions.findIndex(a => a.WFWorkflowActionParameters?.WFAlertActionTitle === 'Review before saving to Health');
  assert.ok(review >= 0, 'Missing nutrition review');
  const alert = actions[review];
  assert.equal(alert.WFWorkflowActionIdentifier, 'is.workflow.actions.alert');
  assert.equal(alert.WFWorkflowActionParameters.WFAlertActionCancelButtonShown, true, 'Review must offer Cancel');
  const message = alert.WFWorkflowActionParameters.WFAlertActionMessage.Value;
  assert.match(message.string, /not medical advice/);
  assert.match(message.string, /Cancel to save nothing/);
  const shown = Object.fromEntries(Object.values(message.attachmentsByRange).map(a => [a.OutputName, a.OutputUUID]));
  const expected = [['Dietary Energy', 'kcal', 'kcal'], ['Protein', 'protein', 'g'], ['Carbohydrates', 'carbs', 'g'], ['Total Fat', 'fat', 'g']];
  const writes = actions.flatMap((a, i) => a.WFWorkflowActionIdentifier === 'is.workflow.actions.health.quantity.log' ? [i] : []);
  assert.deepEqual(writes, expected.map((_, i) => review + i + 1), 'All Health writes must immediately follow review');
  let depth = 0;
  for (const action of actions.slice(0, review)) {
    const mode = action.WFWorkflowActionParameters?.WFControlFlowMode;
    if (mode === 0) depth++;
    if (mode === 2) depth--;
  }
  assert.equal(depth, 0, 'Review must not be inside a skippable branch');
  for (let i = 0; i < expected.length; i++) {
    const [type, name, unit] = expected[i];
    const params = actions[writes[i]].WFWorkflowActionParameters;
    assert.equal(params.WFQuantitySampleType, type);
    assert.equal(params.WFQuantitySampleQuantity.WFSerializationType, 'WFQuantityFieldValue');
    assert.equal(params.WFQuantitySampleQuantity.Value.Unit, unit);
    assert.ok(shown[name], `Review must show ${name}`);
    assert.equal(params.WFQuantitySampleQuantity.Value.Magnitude.Value.OutputUUID, shown[name], 'Saved value must equal the reviewed value');
  }
  assert.equal(workflow.WFWorkflowImportQuestions?.length ?? 0, 0, 'The key is asked for on first run, not on import');
  assert.ok(actions.some(a => a.WFWorkflowActionIdentifier === 'is.workflow.actions.filter.notes'), 'Must look up the saved key note');
  assert.ok(!actions.some(a => a.WFWorkflowActionIdentifier === 'is.workflow.actions.documentpicker.open'), 'Get File fails when the Shortcuts folder is missing');
}
