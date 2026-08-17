// customer.reducer.ts — NgRx reducer for the shared customer-list state.
import { createReducer } from '@ngrx/store';

// TODO: define the customer state shape — customers[], loading, error (Spec §7.5: shared list state).
export interface CustomerState {}

export const initialCustomerState: CustomerState = {};

// TODO: add on(...) handlers for load/loadSuccess/loadFailure and CRUD result actions.
export const customerReducer = createReducer(initialCustomerState);
