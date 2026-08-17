import { customerReducer, initialCustomerState } from './customer.reducer';

describe('customerReducer', () => {
  it('should return the current state for an unknown action', () => {
    const state = customerReducer(initialCustomerState, { type: 'unknown' });
    expect(state).toBe(initialCustomerState);
  });

  // TODO: add tests for load/loadSuccess/loadFailure and CRUD state transitions
});
