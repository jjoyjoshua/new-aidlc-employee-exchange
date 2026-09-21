import { describe, expect, it } from 'vitest';
import { cancellationCopy } from './cancellation-copy.js';

describe('cancellationCopy (US-029/AC-04, AC-05, AC-06, BR-001.20)', () => {
  it('names no actor for a self-cancellation (US-029/AC-05)', () => {
    expect(cancellationCopy('owner')).toEqual({ actorClause: '', includeRebookInvite: true });
  });

  it('names the office admin role, never an individual, for an admin cancellation (US-029/AC-04)', () => {
    expect(cancellationCopy('admin')).toEqual({ actorClause: ' by your office admin', includeRebookInvite: true });
  });

  it('names the office admin role but omits the rebooking invite for the deactivation cascade (US-029/AC-06)', () => {
    expect(cancellationCopy('deactivation_cascade')).toEqual({
      actorClause: ' by your office admin',
      includeRebookInvite: false,
    });
  });
});
