export type AcceptedItemCase = Readonly<{
  kind: 'accepted';
  testCaseId: `DATA_TC_${string}`;
  title: string;
  nameVariant: 'normal' | 'max-length' | 'single-character';
  expectedStatus: 201;
}>;

export type RejectedItemCase = Readonly<{
  kind: 'rejected';
  testCaseId: `DATA_TC_${string}`;
  title: string;
  name: string | number;
  expectedStatus: 400;
  expectedError: string;
}>;

export type ItemCase = AcceptedItemCase | RejectedItemCase;

const validationError = 'Item name must be a non-empty string of at most 200 characters';

export const itemCases = [
  { kind: 'accepted', testCaseId: 'DATA_TC_001', title: 'creates and displays a synthetic item', nameVariant: 'normal', expectedStatus: 201 },
  { kind: 'accepted', testCaseId: 'DATA_TC_002', title: 'accepts an exact 200-character name', nameVariant: 'max-length', expectedStatus: 201 },
  { kind: 'accepted', testCaseId: 'DATA_TC_003', title: 'accepts a one-character name', nameVariant: 'single-character', expectedStatus: 201 },
  { kind: 'rejected', testCaseId: 'DATA_TC_004', title: 'rejects an empty name', name: '', expectedStatus: 400, expectedError: validationError },
  { kind: 'rejected', testCaseId: 'DATA_TC_005', title: 'rejects a whitespace-only name', name: '   ', expectedStatus: 400, expectedError: validationError },
  { kind: 'rejected', testCaseId: 'DATA_TC_006', title: 'rejects a 201-character name', name: 'x'.repeat(201), expectedStatus: 400, expectedError: validationError },
  { kind: 'rejected', testCaseId: 'DATA_TC_007', title: 'rejects a numeric name', name: 7, expectedStatus: 400, expectedError: validationError },
] as const satisfies readonly ItemCase[];
